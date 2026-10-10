import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { getPool } from '@/lib/db/client';
import * as identity from '@/modules/identity/service';
import { signUpSchema } from '@/modules/identity/validators';
import * as repo from '@/modules/notes/repository';
import { inkNoteSchema, noteSchema } from '@/modules/notes/validators';

/**
 * The diary: entries can be written, changed, pinned, searched and deleted
 * — and none of that ever reaches across from one user to another.
 */

const ctx = { ip: '203.0.113.91', userAgent: 'vitest' };

async function reset() {
  await getPool().query('truncate table users cascade');
  await getPool().query('truncate table rate_limits');
}

async function makeUser(email: string) {
  const result = await identity.signUp(
    signUpSchema.parse({
      email,
      password: 'a sufficiently long passphrase',
      dateOfBirth: '1990-01-01',
      acceptedTerms: true,
      displayName: 'Writer',
    }),
    ctx,
  );
  if (!result.ok) throw new Error('setup failed');
  return result.user;
}

const note = (input: Record<string, unknown>) => noteSchema.parse(input);

describe('notes', () => {
  beforeEach(reset);
  afterAll(reset);

  it('normalises blank title and mood to null and trims the body', () => {
    expect(note({ title: '  ', body: '  hello  ', mood: '' })).toEqual({
      title: null,
      body: 'hello',
      mood: null,
    });
    expect(noteSchema.safeParse({ body: '   ' }).success).toBe(false);
    expect(noteSchema.safeParse({ body: 'x', mood: 'ecstatic' }).success).toBe(false);
  });

  it('writes, edits, pins and deletes an entry', async () => {
    const user = await makeUser('writer@example.com');

    const created = await repo.createNote(user.id, note({ body: 'First line', mood: 'good' }));
    expect(created.mood).toBe('good');
    expect(created.pinned).toBe(false);

    const updated = await repo.updateNote(
      user.id,
      created.id,
      note({ title: 'Monday', body: 'First line, rewritten' }),
    );
    expect(updated?.title).toBe('Monday');
    expect(updated?.body).toBe('First line, rewritten');
    expect(updated?.mood).toBeNull();
    expect(updated!.updatedAt.getTime()).toBeGreaterThanOrEqual(created.updatedAt.getTime());

    await repo.createNote(user.id, note({ body: 'Second entry' }));
    expect(await repo.setNotePinned(user.id, created.id, true)).toBe(true);
    const listed = await repo.listNotes(user.id);
    expect(listed.map((n) => n.id)[0]).toBe(created.id);

    expect(await repo.deleteNote(user.id, created.id)).toBe(true);
    expect(await repo.countNotes(user.id)).toBe(1);
  });

  it('searches title and body, treating % and _ literally', async () => {
    const user = await makeUser('search@example.com');
    await repo.createNote(user.id, note({ title: 'Gym', body: 'Leg day' }));
    await repo.createNote(user.id, note({ body: 'Saved 50% of salary' }));
    await repo.createNote(user.id, note({ body: 'Saved 500 rupees' }));

    expect((await repo.listNotes(user.id, { search: 'gym' })).length).toBe(1);
    expect((await repo.listNotes(user.id, { search: 'leg' })).length).toBe(1);
    expect((await repo.listNotes(user.id, { search: '50%' })).map((n) => n.body)).toEqual([
      'Saved 50% of salary',
    ]);
  });

  it("never reads, changes or deletes another user's entry", async () => {
    const owner = await makeUser('owner@example.com');
    const other = await makeUser('other@example.com');
    const mine = await repo.createNote(owner.id, note({ body: 'Private thought' }));

    expect(await repo.listNotes(other.id)).toEqual([]);
    expect(await repo.listNotes(other.id, { search: 'Private' })).toEqual([]);
    expect(await repo.updateNote(other.id, mine.id, note({ body: 'hijacked' }))).toBeUndefined();
    expect(await repo.setNotePinned(other.id, mine.id, true)).toBe(false);
    expect(await repo.deleteNote(other.id, mine.id)).toBe(false);

    const [still] = await repo.listNotes(owner.id);
    expect(still?.body).toBe('Private thought');
    expect(still?.pinned).toBe(false);
  });
});

describe('handwritten pages', () => {
  beforeEach(reset);

  const ink = {
    v: 1 as const,
    width: 1000 as const,
    height: 700,
    strokes: [{ points: [100, 100, 50, 160, 140, 60, 220, 120, 55], size: 5.5 }],
  };

  it('saves the strokes without words, lists only a flag, and exports the strokes', async () => {
    const user = await makeUser('ink@example.com');
    const page = await repo.createNote(user.id, inkNoteSchema.parse({ ink }));
    expect(page.body).toBe('');
    expect(page.ink).toEqual(ink);

    const [listed] = await repo.listNotes(user.id);
    expect(listed).toMatchObject({ id: page.id, hasInk: true });
    expect(listed).not.toHaveProperty('ink');

    const [exported] = await repo.listNotesForExport(user.id);
    expect(exported?.ink).toEqual(ink);

    // The transcription becomes searchable once written.
    await repo.updateNote(user.id, page.id, {
      title: null,
      body: 'Walked by the lake',
      mood: null,
    });
    expect((await repo.listNotes(user.id, { search: 'lake' })).map((n) => n.id)).toEqual([page.id]);
  });

  it('refuses an entry with neither words nor ink at the database', async () => {
    const user = await makeUser('blank@example.com');
    await expect(repo.createNote(user.id, { title: null, body: '', mood: null })).rejects.toThrow();
  });

  it("never returns another user's page", async () => {
    const owner = await makeUser('owner@example.com');
    const other = await makeUser('other@example.com');
    const page = await repo.createNote(owner.id, inkNoteSchema.parse({ ink }));
    expect(await repo.findNote(other.id, page.id)).toBeUndefined();
    expect(await repo.findNote(owner.id, page.id)).toBeDefined();
  });
});
