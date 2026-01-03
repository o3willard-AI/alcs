#!/usr/bin/env python3
"""
Validate Dockerfile for best practices and common issues
"""
import re
import sys
from pathlib import Path

def validate_dockerfile(dockerfile_path):
    """Validate Dockerfile structure and best practices"""
    errors = []
    warnings = []
    info = []

    try:
        with open(dockerfile_path, 'r') as f:
            lines = f.readlines()

        # Track Dockerfile characteristics
        has_from = False
        has_user = False
        has_healthcheck = False
        has_entrypoint = False
        has_cmd = False
        base_image = None
        uses_multi_stage = False
        stage_names = []
        run_commands = []
        copy_commands = []

        current_stage = None

        for i, line in enumerate(lines, 1):
            stripped = line.strip()

            # Skip comments and empty lines
            if not stripped or stripped.startswith('#'):
                continue

            # Check for FROM
            if stripped.upper().startswith('FROM'):
                has_from = True
                match = re.match(r'FROM\s+([\w/:.-]+)(?:\s+AS\s+(\w+))?', stripped, re.IGNORECASE)
                if match:
                    image = match.group(1)
                    stage_name = match.group(2)

                    if stage_name:
                        uses_multi_stage = True
                        stage_names.append(stage_name)
                        current_stage = stage_name

                    if base_image is None:
                        base_image = image

                        # Check base image
                        if ':latest' in image or ':' not in image:
                            warnings.append(f"Line {i}: Base image uses 'latest' or no tag: {image}")

                        if 'alpine' in image:
                            info.append(f"Line {i}: Using Alpine Linux base (good for size)")

                        if 'node:20' in image:
                            info.append(f"Line {i}: Using Node.js 20 LTS (good choice)")

            # Check for USER
            elif stripped.upper().startswith('USER'):
                has_user = True
                user = stripped.split()[1] if len(stripped.split()) > 1 else ''
                if user == 'root':
                    errors.append(f"Line {i}: Running as root user (security risk)")
                else:
                    info.append(f"Line {i}: Running as non-root user '{user}' (good)")

            # Check for HEALTHCHECK
            elif stripped.upper().startswith('HEALTHCHECK'):
                has_healthcheck = True
                info.append(f"Line {i}: Health check configured (good)")

            # Check for ENTRYPOINT
            elif stripped.upper().startswith('ENTRYPOINT'):
                has_entrypoint = True
                if 'tini' in stripped or 'dumb-init' in stripped:
                    info.append(f"Line {i}: Using init system for signal handling (good)")

            # Check for CMD
            elif stripped.upper().startswith('CMD'):
                has_cmd = True

            # Check RUN commands
            elif stripped.upper().startswith('RUN'):
                run_commands.append((i, stripped))

                # Check for apt-get without -y
                if 'apt-get' in stripped and '-y' not in stripped and '--yes' not in stripped:
                    warnings.append(f"Line {i}: apt-get without -y (may hang)")

                # Check for cache cleanup
                if 'apt-get install' in stripped and 'rm -rf /var/lib/apt/lists/*' not in stripped:
                    warnings.append(f"Line {i}: apt-get install without cache cleanup")

                if 'apk add' in stripped and 'rm -rf /var/cache/apk/*' not in stripped:
                    # Check if cleanup is on next line
                    if i < len(lines) and 'rm -rf /var/cache/apk/*' not in lines[i]:
                        info.append(f"Line {i}: Consider cleaning apk cache in same RUN")

                # Check for npm ci vs npm install
                if 'npm install' in stripped and 'npm ci' not in stripped:
                    warnings.append(f"Line {i}: Use 'npm ci' instead of 'npm install' for reproducible builds")
                elif 'npm ci' in stripped:
                    info.append(f"Line {i}: Using 'npm ci' for reproducible builds (good)")

            # Check COPY commands
            elif stripped.upper().startswith('COPY'):
                copy_commands.append((i, stripped))

                # Check for --chown flag
                if '--chown' in stripped:
                    info.append(f"Line {i}: Using --chown in COPY (efficient)")

            # Check WORKDIR
            elif stripped.upper().startswith('WORKDIR'):
                if not stripped.startswith('WORKDIR /'):
                    warnings.append(f"Line {i}: WORKDIR should use absolute path")

            # Check EXPOSE
            elif stripped.upper().startswith('EXPOSE'):
                port = stripped.split()[1] if len(stripped.split()) > 1 else ''
                info.append(f"Line {i}: Exposing port {port}")

        # Overall checks
        if not has_from:
            errors.append("No FROM instruction found")

        if not has_user:
            warnings.append("No USER instruction (will run as root)")

        if not has_healthcheck:
            warnings.append("No HEALTHCHECK instruction (recommended)")

        if not has_cmd and not has_entrypoint:
            errors.append("No CMD or ENTRYPOINT instruction")

        if uses_multi_stage:
            info.append(f"Multi-stage build detected ({len(stage_names)} stages: {', '.join(stage_names)})")
            info.append("Multi-stage builds reduce final image size (good)")

        if base_image:
            info.append(f"Base image: {base_image}")

        # Check layer optimization
        if len(run_commands) > 10:
            warnings.append(f"Many RUN commands ({len(run_commands)}). Consider combining for fewer layers.")

    except Exception as e:
        errors.append(f"Error reading Dockerfile: {e}")

    return errors, warnings, info

def check_required_files():
    """Check if all required files for build exist"""
    errors = []
    warnings = []
    info = []

    required_files = [
        ('package.json', True),
        ('package-lock.json', True),
        ('tsconfig.json', True),
        ('src', True),
    ]

    optional_files = [
        ('prisma', False),
        ('.dockerignore', False),
        ('config', False),
    ]

    print("📁 Checking required files...")
    for file_path, required in required_files:
        path = Path(file_path)
        if path.exists():
            print(f"   ✅ {file_path}")
        else:
            if required:
                errors.append(f"Required file/directory missing: {file_path}")
                print(f"   ❌ {file_path} (REQUIRED)")
            else:
                warnings.append(f"Optional file/directory missing: {file_path}")
                print(f"   ⚠️  {file_path} (optional)")

    print(f"\n📁 Checking optional files...")
    for file_path, _ in optional_files:
        path = Path(file_path)
        if path.exists():
            print(f"   ✅ {file_path}")
            info.append(f"Optional file present: {file_path}")
        else:
            print(f"   ⚠️  {file_path} (not found, may be optional)")

    # Check .dockerignore
    dockerignore = Path('.dockerignore')
    if not dockerignore.exists():
        warnings.append(".dockerignore not found - may copy unnecessary files")
        info.append("Consider creating .dockerignore to reduce build context size")
    else:
        info.append(".dockerignore present (good for build efficiency)")

    return errors, warnings, info

def check_package_json():
    """Check package.json for required scripts"""
    errors = []
    warnings = []
    info = []

    try:
        import json

        with open('package.json', 'r') as f:
            package = json.load(f)

        print("\n📦 Checking package.json scripts...")

        required_scripts = ['build', 'start']
        for script in required_scripts:
            if script in package.get('scripts', {}):
                print(f"   ✅ {script}: {package['scripts'][script]}")
                info.append(f"Script '{script}' found")
            else:
                errors.append(f"Required script missing: {script}")
                print(f"   ❌ {script} (REQUIRED)")

        # Check dependencies
        deps = package.get('dependencies', {})
        dev_deps = package.get('devDependencies', {})

        print(f"\n📦 Dependencies:")
        print(f"   Production: {len(deps)}")
        print(f"   Development: {len(dev_deps)}")

        # Check for TypeScript
        if 'typescript' in dev_deps or 'typescript' in deps:
            info.append("TypeScript found in dependencies")
        else:
            warnings.append("TypeScript not found in dependencies")

        # Check for Prisma
        if 'prisma' in dev_deps and '@prisma/client' in deps:
            info.append("Prisma found in dependencies (used in Dockerfile)")

    except FileNotFoundError:
        errors.append("package.json not found")
    except json.JSONDecodeError as e:
        errors.append(f"Invalid JSON in package.json: {e}")
    except Exception as e:
        errors.append(f"Error reading package.json: {e}")

    return errors, warnings, info

def main():
    print("🐳 Docker Image Build Validation")
    print("=" * 60)
    print()

    all_errors = []
    all_warnings = []
    all_info = []

    # Check Dockerfile
    dockerfile = Path('Dockerfile.prod')
    if not dockerfile.exists():
        print("❌ Dockerfile.prod not found")
        sys.exit(1)

    print("1. Validating Dockerfile.prod...")
    print("-" * 60)
    errors, warnings, info = validate_dockerfile(dockerfile)
    all_errors.extend(errors)
    all_warnings.extend(warnings)
    all_info.extend(info)

    if errors:
        print("\n❌ Errors:")
        for error in errors:
            print(f"   • {error}")

    if warnings:
        print("\n⚠️  Warnings:")
        for warning in warnings:
            print(f"   • {warning}")

    if info:
        print("\n✨ Good practices found:")
        for i in info:
            print(f"   • {i}")

    # Check required files
    print("\n" + "=" * 60)
    print("2. Checking Build Dependencies")
    print("-" * 60)
    errors, warnings, info = check_required_files()
    all_errors.extend(errors)
    all_warnings.extend(warnings)
    all_info.extend(info)

    # Check package.json
    print("\n" + "=" * 60)
    print("3. Validating package.json")
    print("-" * 60)
    errors, warnings, info = check_package_json()
    all_errors.extend(errors)
    all_warnings.extend(warnings)
    all_info.extend(info)

    # Summary
    print("\n" + "=" * 60)
    print("Summary")
    print("=" * 60)
    print(f"Errors: {len(all_errors)}")
    print(f"Warnings: {len(all_warnings)}")
    print(f"Info: {len(all_info)}")

    if all_errors:
        print("\n❌ Validation FAILED")
        print("\nCritical issues must be fixed before building:")
        for error in all_errors:
            print(f"  • {error}")
        return 1
    elif all_warnings:
        print("\n⚠️  Validation passed with warnings")
        print("\nConsider addressing these warnings:")
        for warning in all_warnings[:5]:  # Show first 5
            print(f"  • {warning}")
        if len(all_warnings) > 5:
            print(f"  ... and {len(all_warnings) - 5} more")
        return 0
    else:
        print("\n✅ All checks passed!")
        print("Dockerfile is ready to build.")
        return 0

if __name__ == '__main__':
    sys.exit(main())
