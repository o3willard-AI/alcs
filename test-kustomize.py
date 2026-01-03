#!/usr/bin/env python3
"""
Test Kustomize configuration
"""
import yaml
from pathlib import Path

def test_kustomize_config():
    """Test kustomization.yaml configuration"""
    errors = []
    warnings = []

    k8s_dir = Path('k8s')
    kustomization_file = k8s_dir / 'kustomization.yaml'

    if not kustomization_file.exists():
        errors.append("kustomization.yaml not found")
        return errors, warnings

    try:
        with open(kustomization_file, 'r') as f:
            config = yaml.safe_load(f)

        # Check apiVersion and kind
        if config.get('apiVersion') != 'kustomize.config.k8s.io/v1beta1':
            warnings.append(f"Unexpected apiVersion: {config.get('apiVersion')}")

        if config.get('kind') != 'Kustomization':
            errors.append(f"Expected kind: Kustomization, got: {config.get('kind')}")

        # Check namespace
        namespace = config.get('namespace')
        if not namespace:
            warnings.append("No namespace specified in kustomization.yaml")
        else:
            print(f"✅ Target namespace: {namespace}")

        # Check resources
        resources = config.get('resources', [])
        if not resources:
            errors.append("No resources specified in kustomization.yaml")
        else:
            print(f"\n📦 Checking {len(resources)} resource files...")

            for resource in resources:
                resource_path = k8s_dir / resource
                if resource_path.exists():
                    print(f"   ✅ {resource}")
                else:
                    errors.append(f"Resource file not found: {resource}")
                    print(f"   ❌ {resource} (NOT FOUND)")

        # Check images
        images = config.get('images', [])
        if images:
            print(f"\n🐳 Image transformations:")
            for image in images:
                name = image.get('name')
                new_name = image.get('newName')
                new_tag = image.get('newTag')
                print(f"   {name} → {new_name}:{new_tag}")

                if 'your-registry' in new_name:
                    warnings.append(f"Image uses placeholder registry: {new_name}")
                if new_tag == '1.0.0':
                    warnings.append(f"Image tag is default 1.0.0, update for your version")

        # Check common labels
        common_labels = config.get('commonLabels', {})
        if common_labels:
            print(f"\n🏷️  Common labels:")
            for key, value in common_labels.items():
                print(f"   {key}: {value}")

        # Check for commented generators (informational)
        with open(kustomization_file, 'r') as f:
            content = f.read()

        if '# configMapGenerator' in content:
            print(f"\n💡 Note: ConfigMap generator is commented out (using configmap.yaml)")
        if '# secretGenerator' in content:
            print(f"💡 Note: Secret generator is commented out (using secret.yaml)")

    except yaml.YAMLError as e:
        errors.append(f"YAML parsing error: {e}")
    except Exception as e:
        errors.append(f"Error reading kustomization.yaml: {e}")

    return errors, warnings

def main():
    print("🔍 Testing Kustomize configuration...\n")

    errors, warnings = test_kustomize_config()

    if errors or warnings:
        print(f"\n{'='*60}")

    if errors:
        print(f"\n❌ Errors found:")
        for error in errors:
            print(f"   • {error}")

    if warnings:
        print(f"\n⚠️  Warnings:")
        for warning in warnings:
            print(f"   • {warning}")

    print(f"\n{'='*60}")
    print(f"Summary:")
    print(f"  Errors: {len(errors)}")
    print(f"  Warnings: {len(warnings)}")

    if errors:
        print(f"\n❌ Kustomize configuration test FAILED")
        return 1
    elif warnings:
        print(f"\n⚠️  Kustomize configuration test passed with warnings")
        print(f"   (These are expected - update placeholders before deployment)")
        return 0
    else:
        print(f"\n✅ Kustomize configuration is valid!")
        return 0

if __name__ == '__main__':
    exit(main())
