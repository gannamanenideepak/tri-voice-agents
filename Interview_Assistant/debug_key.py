import os
from dotenv import load_dotenv

load_dotenv()
key = os.getenv("GOOGLE_API_KEY")
print(repr(key))
print(len(key) if key else "NOT FOUND")
