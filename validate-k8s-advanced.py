#!/usr/bin/env python3
"""
Advanced validation for Kubernetes manifests
Checks best practices and common issues
"""
import yaml
import sys
from pathlib import Path
from collections import defaultdict

def validate_deployment(doc, file_path):
    """Validate Deployment best practices"""
    errors = []
    warnings = []

    spec = doc.get('spec', {})
    template = spec.get('template', {})
    pod_spec = template.get('spec', {})
    metadata = template.get('metadata', {})

    # Check for pod labels
    if not metadata.get('labels'):
        warnings.append(f"{file_path}: Deployment template should have labels")

    # Check selector matches template labels
    selector = spec.get('selector', {}).get('matchLabels', {})
    template_labels = metadata.get('labels', {})
    if selector and template_labels:
        for key, value in selector.items():
            if template_labels.get(key) != value:
                errors.append(f"{file_path}: Selector label {key}={value} doesn't match template label")

    # Check containers
    containers = pod_spec.get('containers', [])
    for container in containers:
        name = container.get('name', 'unnamed')

        # Check image tag
        image = container.get('image', '')
        if ':latest' in image or ':' not in image:
            warnings.append(f"{file_path}: Container '{name}' uses 'latest' tag or no tag")

        # Check resource limits
        resources = container.get('resources', {})
        if not resources.get('limits'):
            warnings.append(f"{file_path}: Container '{name}' has no resource limits")
        if not resources.get('requests'):
            warnings.append(f"{file_path}: Container '{name}' has no resource requests")

        # Check security context
        security_context = container.get('securityContext', {})
        if security_context.get('privileged'):
            errors.append(f"{file_path}: Container '{name}' runs as privileged")
        if not security_context.get('runAsNonRoot'):
            warnings.append(f"{file_path}: Container '{name}' doesn't explicitly set runAsNonRoot")
        if not security_context.get('readOnlyRootFilesystem'):
            warnings.append(f"{file_path}: Container '{name}' doesn't use readOnlyRootFilesystem")

    return errors, warnings

def validate_service(doc, file_path):
    """Validate Service configuration"""
    errors = []
    warnings = []

    spec = doc.get('spec', {})
    selector = spec.get('selector', {})

    # Check for selector (unless headless)
    if spec.get('clusterIP') != 'None' and not selector:
        warnings.append(f"{file_path}: Service has no selector")

    # Check ports
    ports = spec.get('ports', [])
    port_names = set()
    for port in ports:
        port_name = port.get('name')
        if port_name:
            if port_name in port_names:
                errors.append(f"{file_path}: Duplicate port name '{port_name}'")
            port_names.add(port_name)

    return errors, warnings

def validate_ingress(doc, file_path):
    """Validate Ingress configuration"""
    errors = []
    warnings = []

    spec = doc.get('spec', {})

    # Check for TLS
    if not spec.get('tls'):
        warnings.append(f"{file_path}: Ingress doesn't configure TLS")

    # Check rules
    rules = spec.get('rules', [])
    for rule in rules:
        host = rule.get('host')
        if not host:
            warnings.append(f"{file_path}: Ingress rule has no host")
        elif 'example.com' in host:
            warnings.append(f"{file_path}: Ingress uses example.com (placeholder?)")

    return errors, warnings

def validate_secret(doc, file_path):
    """Validate Secret configuration"""
    errors = []
    warnings = []

    data = doc.get('data', {})
    string_data = doc.get('stringData', {})

    # Check for placeholder values
    all_data = {**data, **string_data}
    for key, value in all_data.items():
        if value and 'CHANGE_ME' in str(value):
            warnings.append(f"{file_path}: Secret '{key}' contains CHANGE_ME placeholder")

    return errors, warnings

def validate_hpa(doc, file_path):
    """Validate HorizontalPodAutoscaler"""
    errors = []
    warnings = []

    spec = doc.get('spec', {})

    min_replicas = spec.get('minReplicas', 1)
    max_replicas = spec.get('maxReplicas', 1)

    if min_replicas >= max_replicas:
        errors.append(f"{file_path}: minReplicas ({min_replicas}) >= maxReplicas ({max_replicas})")

    if min_replicas < 2:
        warnings.append(f"{file_path}: minReplicas is {min_replicas} (consider >= 2 for HA)")

    return errors, warnings

def validate_network_policy(doc, file_path):
    """Validate NetworkPolicy"""
    errors = []
    warnings = []

    spec = doc.get('spec', {})

    # Check if it has both ingress and egress rules
    policy_types = spec.get('policyTypes', [])
    if 'Ingress' not in policy_types and 'Egress' not in policy_types:
        warnings.append(f"{file_path}: NetworkPolicy has no policyTypes")

    return errors, warnings

def validate_advanced(file_path):
    """Advanced validation for a YAML file"""
    errors = []
    warnings = []

    try:
        with open(file_path, 'r') as f:
            docs = list(yaml.safe_load_all(f.read()))

        for doc in docs:
            if doc is None:
                continue

            kind = doc.get('kind', '')

            if kind == 'Deployment' or kind == 'StatefulSet':
                e, w = validate_deployment(doc, file_path.name)
                errors.extend(e)
                warnings.extend(w)

            elif kind == 'Service':
                e, w = validate_service(doc, file_path.name)
                errors.extend(e)
                warnings.extend(w)

            elif kind == 'Ingress':
                e, w = validate_ingress(doc, file_path.name)
                errors.extend(e)
                warnings.extend(w)

            elif kind == 'Secret':
                e, w = validate_secret(doc, file_path.name)
                errors.extend(e)
                warnings.extend(w)

            elif kind == 'HorizontalPodAutoscaler':
                e, w = validate_hpa(doc, file_path.name)
                errors.extend(e)
                warnings.extend(w)

            elif kind == 'NetworkPolicy':
                e, w = validate_network_policy(doc, file_path.name)
                errors.extend(e)
                warnings.extend(w)

    except Exception as e:
        errors.append(f"Error validating {file_path}: {e}")

    return errors, warnings

def check_label_consistency():
    """Check label consistency across all resources"""
    errors = []
    warnings = []

    k8s_dir = Path('k8s')
    app_labels = defaultdict(set)

    for yaml_file in k8s_dir.glob('*.yaml'):
        if yaml_file.name == 'kustomization.yaml':
            continue

        try:
            with open(yaml_file, 'r') as f:
                docs = list(yaml.safe_load_all(f.read()))

            for doc in docs:
                if doc is None:
                    continue

                metadata = doc.get('metadata', {})
                labels = metadata.get('labels', {})

                app_label = labels.get('app')
                if app_label:
                    app_labels[yaml_file.name].add(app_label)

        except Exception:
            pass

    # Check for consistency
    all_apps = set()
    for file_name, apps in app_labels.items():
        all_apps.update(apps)

    if len(all_apps) > 5:  # Too many different app labels
        warnings.append(f"Found {len(all_apps)} different 'app' labels. Consider standardization.")

    return errors, warnings

def main():
    k8s_dir = Path('k8s')
    yaml_files = [f for f in k8s_dir.glob('*.yaml') if f.name != 'kustomization.yaml']

    print(f"🔍 Running advanced validation on {len(yaml_files)} manifest files...\n")

    all_errors = []
    all_warnings = []

    for yaml_file in sorted(yaml_files):
        errors, warnings = validate_advanced(yaml_file)

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

    # Check label consistency
    print(f"\n📋 Checking label consistency...")
    errors, warnings = check_label_consistency()
    all_errors.extend(errors)
    all_warnings.extend(warnings)
    if errors:
        for error in errors:
            print(f"   ERROR: {error}")
    if warnings:
        for warning in warnings:
            print(f"   WARNING: {warning}")
    else:
        print(f"   ✅ Labels are consistent")

    print(f"\n{'='*60}")
    print(f"Summary:")
    print(f"  Files checked: {len(yaml_files)}")
    print(f"  Errors: {len(all_errors)}")
    print(f"  Warnings: {len(all_warnings)}")

    if all_errors:
        print(f"\n❌ Advanced validation FAILED with {len(all_errors)} error(s)")
        sys.exit(1)
    elif all_warnings:
        print(f"\n⚠️  Advanced validation passed with {len(all_warnings)} warning(s)")
        print(f"   (Warnings are suggestions, not blockers)")
        sys.exit(0)
    else:
        print(f"\n✅ All manifests pass advanced validation!")
        sys.exit(0)

if __name__ == '__main__':
    main()
