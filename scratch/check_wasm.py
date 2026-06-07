import re

with open('/Users/matt/dev/project/web/stargazer/public/aladin.js', 'r') as f:
    content = f.read()

# Search for any occurrence of .wasm, or wasm related paths/variables
matches = re.findall(r'[^"\'\s]*?\.wasm[^"\'\s]*', content)
print("Wasm file matches:", set(matches))

# Find references to wasm path configuration or fetching
fetch_refs = re.findall(r'(\w+?wasm\w+?)', content, re.I)
print("Wasm word references:", set(fetch_refs))

# Let's search for "A.init" or similar initialization config
init_refs = re.findall(r'init\s*:\s*function', content)
print("Init function refs:", len(init_refs))

# Let's search for squoosh or similar. Wait, where is the wasm file url built?
wasm_urls = re.findall(r'https?://[^\s"\']*?\.wasm', content)
print("Absolute wasm URLs:", set(wasm_urls))
