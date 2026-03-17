#!/usr/bin/env python3
"""
Quick validation script for OpenLoaf skills - validates SKILL.md and openloaf.json
"""

import sys
import os
import re
import json
import yaml
from pathlib import Path

def validate_openloaf_json(skill_path):
    """Validate openloaf.json metadata file"""
    openloaf_json = skill_path / 'openloaf.json'
    if not openloaf_json.exists():
        return False, "openloaf.json not found"

    try:
        data = json.loads(openloaf_json.read_text())
    except json.JSONDecodeError as e:
        return False, f"Invalid JSON in openloaf.json: {e}"

    if not isinstance(data, dict):
        return False, "openloaf.json must be a JSON object"

    # Check required fields
    required_fields = ['name', 'description', 'icon', 'version']
    for field in required_fields:
        if field not in data:
            return False, f"Missing required field '{field}' in openloaf.json"

    # Validate icon is non-empty
    icon = data.get('icon', '')
    if not isinstance(icon, str) or not icon.strip():
        return False, "openloaf.json 'icon' must be a non-empty string (e.g., an emoji)"

    # Validate colorIndex range (0-7)
    if 'colorIndex' in data:
        color_index = data['colorIndex']
        if not isinstance(color_index, int) or not (0 <= color_index <= 7):
            return False, f"openloaf.json 'colorIndex' must be an integer between 0 and 7, got {color_index!r}"

    # Validate version format
    version = data.get('version', '')
    if not isinstance(version, str) or not version.strip():
        return False, "openloaf.json 'version' must be a non-empty string"

    return True, "openloaf.json is valid!"


def validate_skill(skill_path):
    """Basic validation of an OpenLoaf skill"""
    skill_path = Path(skill_path)

    # Check SKILL.md exists
    skill_md = skill_path / 'SKILL.md'
    if not skill_md.exists():
        return False, "SKILL.md not found"

    # Read and validate frontmatter
    content = skill_md.read_text()
    if not content.startswith('---'):
        return False, "No YAML frontmatter found"

    # Extract frontmatter
    match = re.match(r'^---\n(.*?)\n---', content, re.DOTALL)
    if not match:
        return False, "Invalid frontmatter format"

    frontmatter_text = match.group(1)

    # Parse YAML frontmatter
    try:
        frontmatter = yaml.safe_load(frontmatter_text)
        if not isinstance(frontmatter, dict):
            return False, "Frontmatter must be a YAML dictionary"
    except yaml.YAMLError as e:
        return False, f"Invalid YAML in frontmatter: {e}"

    # Define allowed properties
    ALLOWED_PROPERTIES = {'name', 'description', 'license', 'allowed-tools', 'metadata', 'compatibility'}

    # Check for unexpected properties
    unexpected_keys = set(frontmatter.keys()) - ALLOWED_PROPERTIES
    if unexpected_keys:
        return False, (
            f"Unexpected key(s) in SKILL.md frontmatter: {', '.join(sorted(unexpected_keys))}. "
            f"Allowed properties are: {', '.join(sorted(ALLOWED_PROPERTIES))}"
        )

    # Check required fields
    if 'name' not in frontmatter:
        return False, "Missing 'name' in frontmatter"
    if 'description' not in frontmatter:
        return False, "Missing 'description' in frontmatter"

    # Validate name
    name = frontmatter.get('name', '')
    if not isinstance(name, str):
        return False, f"Name must be a string, got {type(name).__name__}"
    name = name.strip()
    if name:
        if not re.match(r'^[a-z0-9-]+$', name):
            return False, f"Name '{name}' should be kebab-case (lowercase letters, digits, and hyphens only)"
        if name.startswith('-') or name.endswith('-') or '--' in name:
            return False, f"Name '{name}' cannot start/end with hyphen or contain consecutive hyphens"
        if len(name) > 64:
            return False, f"Name is too long ({len(name)} characters). Maximum is 64 characters."

    # Validate description
    description = frontmatter.get('description', '')
    if not isinstance(description, str):
        return False, f"Description must be a string, got {type(description).__name__}"
    description = description.strip()
    if description:
        if '<' in description or '>' in description:
            return False, "Description cannot contain angle brackets (< or >)"
        if len(description) > 1024:
            return False, f"Description is too long ({len(description)} characters). Maximum is 1024 characters."

    # Validate compatibility field if present
    compatibility = frontmatter.get('compatibility', '')
    if compatibility:
        if not isinstance(compatibility, str):
            return False, f"Compatibility must be a string, got {type(compatibility).__name__}"
        if len(compatibility) > 500:
            return False, f"Compatibility is too long ({len(compatibility)} characters). Maximum is 500 characters."

    # Also validate openloaf.json
    ok, msg = validate_openloaf_json(skill_path)
    if not ok:
        return False, msg

    return True, "Skill is valid!"


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python quick_validate.py <skill_directory>")
        sys.exit(1)

    valid, message = validate_skill(sys.argv[1])
    print(message)
    sys.exit(0 if valid else 1)
