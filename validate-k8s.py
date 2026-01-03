#!/usr/bin/env python3
"""
Validate Kubernetes YAML manifests
"""
import yaml
import sys
from pathlib import Path

def validate_yaml_file(file_path):
    """Validate a single YAML file"""
    errors = []
    warnings = []

    try:
        with open(file_path, 'r') as f:
            content = f.read()

        # Parse YAML (supports multiple documents)
        docs = list(yaml.safe_load_all(content))

        if not docs:
            errors.append(f"No documents found in {file_path}")
            return errors, warnings

        for i, doc in enumerate(docs):
            if doc is None:
                continue

            # Skip validation for Kustomize configuration files
            kind = doc.get('kind', '')
            if kind == 'Kustomization' or file_path.name == 'kustomization.yaml':
                # Just check it's valid YAML (already parsed)
                continue

            # Check for required Kubernetes fields
            if 'apiVersion' not in doc:
                errors.append(f"Document {i} in {file_path}: Missing 'apiVersion'")

            if 'kind' not in doc:
                errors.append(f"Document {i} in {file_path}: Missing 'kind'")

            if 'metadata' not in doc:
                errors.append(f"Document {i} in {file_path}: Missing 'metadata'")
            elif 'name' not in doc.get('metadata', {}):
                errors.append(f"Document {i} in {file_path}: Missing 'metadata.name'")

            # Check for common issues
            kind = doc.get('kind', '')

            if kind == 'Deployment':
                spec = doc.get('spec', {})
                if 'selector' not in spec:
                    errors.append(f"{file_path}: Deployment missing 'spec.selector'")
                if 'template' not in spec:
                    errors.append(f"{file_path}: Deployment missing 'spec.template'")

            elif kind == 'Service':
                spec = doc.get('spec', {})
                if 'selector' not in spec:
                    warnings.append(f"{file_path}: Service missing 'spec.selector' (headless?)")
                if 'ports' not in spec:
                    errors.append(f"{file_path}: Service missing 'spec.ports'")

            elif kind == 'Secret':
                if doc.get('data') is None and doc.get('stringData') is None:
                    errors.append(f"{file_path}: Secret has no data or stringData")

            elif kind == 'ConfigMap':
                if doc.get('data') is None:
                    warnings.append(f"{file_path}: ConfigMap has no data")

            elif kind == 'Ingress':
                spec = doc.get('spec', {})
                if 'rules' not in spec:
                    errors.append(f"{file_path}: Ingress missing 'spec.rules'")

    except yaml.YAMLError as e:
        errors.append(f"YAML parsing error in {file_path}: {e}")
    except Exception as e:
        errors.append(f"Error reading {file_path}: {e}")

    return errors, warnings

def main():
    k8s_dir = Path('k8s')

    if not k8s_dir.exists():
        print("❌ k8s directory not found")
        sys.exit(1)

    yaml_files = list(k8s_dir.glob('*.yaml'))

    if not yaml_files:
        print("❌ No YAML files found in k8s directory")
        sys.exit(1)

    print(f"🔍 Validating {len(yaml_files)} Kubernetes manifest files...\n")

    all_errors = []
    all_warnings = []

    for yaml_file in sorted(yaml_files):
        errors, warnings = validate_yaml_file(yaml_file)

        if errors:
            print(f"❌ {yaml_file.name}:")
            for error in errors:
                print(f"   ERROR: {error}")
            all_errors.extend(errors)
        elif warnings:
            print(f"⚠️  {yaml_file.name}:")
            for warning in warnings:
                print(f"   WARNING: {warning}")
            all_warnings.extend(warnings)
        else:
            print(f"✅ {yaml_file.name}")

    print(f"\n{'='*60}")
    print(f"Summary:")
    print(f"  Files checked: {len(yaml_files)}")
    print(f"  Errors: {len(all_errors)}")
    print(f"  Warnings: {len(all_warnings)}")

    if all_errors:
        print(f"\n❌ Validation FAILED with {len(all_errors)} error(s)")
        sys.exit(1)
    elif all_warnings:
        print(f"\n⚠️  Validation passed with {len(all_warnings)} warning(s)")
        sys.exit(0)
    else:
        print(f"\n✅ All manifests are valid!")
        sys.exit(0)

if __name__ == '__main__':
    main()
