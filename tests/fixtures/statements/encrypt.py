# Locks savings.pdf with the password "SAMPLE123", as banks lock e-statements.
#   python3 tests/fixtures/statements/encrypt.py   (needs pypdf)
from pathlib import Path
from pypdf import PdfReader, PdfWriter

here = Path(__file__).parent
writer = PdfWriter(clone_from=PdfReader(here / "savings.pdf"))
writer.encrypt("SAMPLE123", algorithm="RC4-128")
with open(here / "savings-locked.pdf", "wb") as out:
    writer.write(out)
print("Locked copy written")
