#!/usr/bin/env python3
"""
ALCS Installation Verification Script

Purpose: Autonomous smoke testing and validation for AI agents
Usage: python3 verify_install.py [--verbose] [--fix]

This script performs comprehensive checks to ensure ALCS is properly installed
and ready for production use. It can be run by AI agents to verify installation
success without human intervention.
"""

import os
import sys
import json
import subprocess
import sqlite3
from pathlib import Path
from typing import Dict, List, Tuple, Optional
from dataclasses import dataclass
from enum import Enum
import urllib.request
import urllib.error

# ANSI color codes
class Color:
    GREEN = '\033[92m'
    YELLOW = '\033[93m'
    RED = '\033[91m'
    BLUE = '\033[94m'
    BOLD = '\033[1m'
    END = '\033[0m'

class CheckStatus(Enum):
    PASS = "PASS"
    WARN = "WARN"
    FAIL = "FAIL"
    SKIP = "SKIP"

@dataclass
class CheckResult:
    name: str
    status: CheckStatus
    message: str
    details: Optional[str] = None
    fix_command: Optional[str] = None

class InstallationVerifier:
    def __init__(self, verbose: bool = False, auto_fix: bool = False):
        self.verbose = verbose
        self.auto_fix = auto_fix
        self.project_root = Path(__file__).parent
        self.results: List[CheckResult] = []
        self.critical_failures = 0
        self.warnings = 0

    def log(self, message: str, color: str = ""):
        """Print a log message with optional color"""
        if color:
            print(f"{color}{message}{Color.END}")
        else:
            print(message)

    def log_verbose(self, message: str):
        """Print verbose message"""
        if self.verbose:
            print(f"  {Color.BLUE}ℹ {message}{Color.END}")

    def add_result(self, result: CheckResult):
        """Add a check result and update counters"""
        self.results.append(result)

        icon = {
            CheckStatus.PASS: f"{Color.GREEN}✓{Color.END}",
            CheckStatus.WARN: f"{Color.YELLOW}⚠{Color.END}",
            CheckStatus.FAIL: f"{Color.RED}✗{Color.END}",
            CheckStatus.SKIP: f"{Color.BLUE}↷{Color.END}",
        }[result.status]

        print(f"{icon} {result.name}: {result.message}")

        if result.details and self.verbose:
            print(f"  {result.details}")

        if result.fix_command:
            print(f"  {Color.YELLOW}Fix: {result.fix_command}{Color.END}")

        if result.status == CheckStatus.FAIL:
            self.critical_failures += 1
        elif result.status == CheckStatus.WARN:
            self.warnings += 1

    def run_command(self, cmd: List[str], cwd: Optional[Path] = None) -> Tuple[int, str, str]:
        """Run a shell command and return exit code, stdout, stderr"""
        try:
            result = subprocess.run(
                cmd,
                cwd=cwd or self.project_root,
                capture_output=True,
                text=True,
                timeout=30
            )
            return result.returncode, result.stdout, result.stderr
        except subprocess.TimeoutExpired:
            return -1, "", "Command timed out"
        except Exception as e:
            return -1, "", str(e)

    def check_file_exists(self, path: Path, name: str, critical: bool = True) -> bool:
        """Check if a file exists"""
        if path.exists():
            self.add_result(CheckResult(
                name=name,
                status=CheckStatus.PASS,
                message=f"Found: {path.name}"
            ))
            return True
        else:
            self.add_result(CheckResult(
                name=name,
                status=CheckStatus.FAIL if critical else CheckStatus.WARN,
                message=f"Missing: {path}",
                details="File does not exist" if critical else "Optional file not found"
            ))
            return False

    # =========================================================================
    # Check 1: Project Structure
    # =========================================================================

    def check_project_structure(self):
        """Verify essential project files and directories"""
        self.log(f"\n{Color.BOLD}=== Project Structure ==={Color.END}")

        essential_files = [
            (self.project_root / "package.json", "package.json"),
            (self.project_root / "tsconfig.json", "tsconfig.json"),
            (self.project_root / "prisma" / "schema.prisma", "Prisma schema"),
            (self.project_root / ".env", "Environment config"),
        ]

        for file_path, name in essential_files:
            self.check_file_exists(file_path, name, critical=True)

        essential_dirs = [
            (self.project_root / "src", "Source directory"),
            (self.project_root / "dist", "Build output"),
            (self.project_root / "node_modules", "Node modules"),
        ]

        for dir_path, name in essential_dirs:
            if dir_path.exists() and dir_path.is_dir():
                self.add_result(CheckResult(
                    name=name,
                    status=CheckStatus.PASS,
                    message=f"Found: {dir_path.name}/"
                ))
            else:
                self.add_result(CheckResult(
                    name=name,
                    status=CheckStatus.FAIL,
                    message=f"Missing: {dir_path}",
                    fix_command="npm install && npm run build"
                ))

    # =========================================================================
    # Check 2: Node.js and npm
    # =========================================================================

    def check_nodejs(self):
        """Verify Node.js and npm installation"""
        self.log(f"\n{Color.BOLD}=== Node.js Environment ==={Color.END}")

        # Check Node.js
        code, stdout, stderr = self.run_command(["node", "--version"])
        if code == 0:
            version = stdout.strip()
            major_version = int(version.split('.')[0].replace('v', ''))
            if major_version >= 18:
                self.add_result(CheckResult(
                    name="Node.js version",
                    status=CheckStatus.PASS,
                    message=f"{version} (≥ v18 required)"
                ))
            else:
                self.add_result(CheckResult(
                    name="Node.js version",
                    status=CheckStatus.FAIL,
                    message=f"{version} (need v18+)",
                    fix_command="Install Node.js v18+ from https://nodejs.org/"
                ))
        else:
            self.add_result(CheckResult(
                name="Node.js",
                status=CheckStatus.FAIL,
                message="Not found",
                fix_command="Install Node.js from https://nodejs.org/"
            ))

        # Check npm
        code, stdout, stderr = self.run_command(["npm", "--version"])
        if code == 0:
            self.add_result(CheckResult(
                name="npm",
                status=CheckStatus.PASS,
                message=f"Version {stdout.strip()}"
            ))
        else:
            self.add_result(CheckResult(
                name="npm",
                status=CheckStatus.FAIL,
                message="Not found",
                fix_command="npm is bundled with Node.js"
            ))

    # =========================================================================
    # Check 3: Dependencies
    # =========================================================================

    def check_dependencies(self):
        """Verify npm dependencies are installed"""
        self.log(f"\n{Color.BOLD}=== Project Dependencies ==={Color.END}")

        package_json = self.project_root / "package.json"
        if not package_json.exists():
            self.add_result(CheckResult(
                name="package.json",
                status=CheckStatus.FAIL,
                message="Not found"
            ))
            return

        with open(package_json) as f:
            package_data = json.load(f)

        # Check critical dependencies
        critical_deps = [
            "@prisma/client",
            "@prisma/adapter-better-sqlite3",
            "typescript",
        ]

        node_modules = self.project_root / "node_modules"
        if not node_modules.exists():
            self.add_result(CheckResult(
                name="Dependencies",
                status=CheckStatus.FAIL,
                message="node_modules not found",
                fix_command="npm install"
            ))
            return

        for dep in critical_deps:
            dep_path = node_modules / dep
            if dep_path.exists():
                self.add_result(CheckResult(
                    name=f"Dependency: {dep}",
                    status=CheckStatus.PASS,
                    message="Installed"
                ))
            else:
                self.add_result(CheckResult(
                    name=f"Dependency: {dep}",
                    status=CheckStatus.FAIL,
                    message="Not installed",
                    fix_command="npm install"
                ))

    # =========================================================================
    # Check 4: TypeScript Compilation
    # =========================================================================

    def check_build(self):
        """Verify TypeScript build"""
        self.log(f"\n{Color.BOLD}=== TypeScript Build ==={Color.END}")

        dist_dir = self.project_root / "dist"
        if not dist_dir.exists():
            self.add_result(CheckResult(
                name="Build output",
                status=CheckStatus.FAIL,
                message="dist/ directory not found",
                fix_command="npm run build"
            ))
            return

        # Check for key compiled files
        key_files = [
            "orchestrator.js",
            "sessionManager.js",
            "mcp/tools.js",
            "services/databaseService.js",
        ]

        all_exist = True
        for file_name in key_files:
            file_path = dist_dir / file_name
            if file_path.exists():
                self.log_verbose(f"Found: {file_name}")
            else:
                all_exist = False
                self.log_verbose(f"Missing: {file_name}")

        if all_exist:
            self.add_result(CheckResult(
                name="Build artifacts",
                status=CheckStatus.PASS,
                message=f"All key files present in dist/"
            ))
        else:
            self.add_result(CheckResult(
                name="Build artifacts",
                status=CheckStatus.FAIL,
                message="Missing compiled files",
                fix_command="npm run build"
            ))

    # =========================================================================
    # Check 5: Database
    # =========================================================================

    def check_database(self):
        """Verify database setup"""
        self.log(f"\n{Color.BOLD}=== Database Configuration ==={Color.END}")

        # Check .env for DATABASE_URL
        env_file = self.project_root / ".env"
        database_url = None

        if env_file.exists():
            with open(env_file) as f:
                for line in f:
                    if line.strip().startswith("DATABASE_URL="):
                        database_url = line.split("=", 1)[1].strip().strip('"').strip("'")
                        break

        if not database_url:
            self.add_result(CheckResult(
                name="DATABASE_URL",
                status=CheckStatus.FAIL,
                message="Not configured in .env",
                fix_command='Add DATABASE_URL="file:./prisma/dev.db" to .env'
            ))
            return

        self.add_result(CheckResult(
            name="DATABASE_URL",
            status=CheckStatus.PASS,
            message=f"Configured: {database_url}"
        ))

        # Check if database file exists (for SQLite)
        if database_url.startswith("file:"):
            db_path_str = database_url.replace("file:", "")
            db_path = (self.project_root / db_path_str).resolve()

            if db_path.exists():
                self.add_result(CheckResult(
                    name="Database file",
                    status=CheckStatus.PASS,
                    message=f"Found: {db_path.name}"
                ))

                # Try to connect and check tables
                try:
                    conn = sqlite3.connect(db_path)
                    cursor = conn.cursor()
                    cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
                    tables = [row[0] for row in cursor.fetchall()]
                    conn.close()

                    expected_tables = ["Session", "Artifact", "Review"]
                    if all(table in tables for table in expected_tables):
                        self.add_result(CheckResult(
                            name="Database schema",
                            status=CheckStatus.PASS,
                            message=f"All tables present: {', '.join(expected_tables)}"
                        ))
                    else:
                        self.add_result(CheckResult(
                            name="Database schema",
                            status=CheckStatus.FAIL,
                            message="Missing tables",
                            details=f"Found: {', '.join(tables)}",
                            fix_command="npx prisma migrate dev --name init"
                        ))
                except Exception as e:
                    self.add_result(CheckResult(
                        name="Database connection",
                        status=CheckStatus.FAIL,
                        message=f"Cannot connect: {str(e)}",
                        fix_command="npx prisma migrate dev --name init"
                    ))
            else:
                self.add_result(CheckResult(
                    name="Database file",
                    status=CheckStatus.FAIL,
                    message="Not found",
                    fix_command="npx prisma migrate dev --name init"
                ))

        # Check Prisma client generation
        prisma_client = self.project_root / "node_modules" / ".prisma" / "client"
        if prisma_client.exists():
            self.add_result(CheckResult(
                name="Prisma client",
                status=CheckStatus.PASS,
                message="Generated"
            ))
        else:
            self.add_result(CheckResult(
                name="Prisma client",
                status=CheckStatus.FAIL,
                message="Not generated",
                fix_command="npx prisma generate"
            ))

    # =========================================================================
    # Check 6: Ollama LLM Server
    # =========================================================================

    def check_ollama(self):
        """Verify Ollama server accessibility"""
        self.log(f"\n{Color.BOLD}=== Ollama LLM Server ==={Color.END}")

        # Get Ollama URL from .env
        env_file = self.project_root / ".env"
        ollama_url = "http://localhost:11434"

        if env_file.exists():
            with open(env_file) as f:
                for line in f:
                    if line.strip().startswith("OLLAMA_BASE_URL="):
                        ollama_url = line.split("=", 1)[1].strip().strip('"').strip("'")
                        break

        # Check Ollama server
        try:
            req = urllib.request.Request(f"{ollama_url}/api/tags")
            with urllib.request.urlopen(req, timeout=5) as response:
                data = json.loads(response.read().decode())

                self.add_result(CheckResult(
                    name="Ollama server",
                    status=CheckStatus.PASS,
                    message=f"Accessible at {ollama_url}"
                ))

                # Check for required models
                models = [model.get('name', '') for model in data.get('models', [])]

                required_models = [
                    ("qwen2.5-coder", "Agent Alpha"),
                    ("deepseek-r1", "Agent Beta"),
                ]

                for model_name, agent_name in required_models:
                    if any(model_name in m for m in models):
                        self.add_result(CheckResult(
                            name=f"Model: {agent_name}",
                            status=CheckStatus.PASS,
                            message=f"Found {model_name}"
                        ))
                    else:
                        self.add_result(CheckResult(
                            name=f"Model: {agent_name}",
                            status=CheckStatus.WARN,
                            message=f"{model_name} not found",
                            fix_command=f"ollama pull {model_name}:32b"
                        ))

        except urllib.error.URLError as e:
            self.add_result(CheckResult(
                name="Ollama server",
                status=CheckStatus.WARN,
                message=f"Not accessible at {ollama_url}",
                details=str(e),
                fix_command="Install Ollama from https://ollama.com/download"
            ))
        except Exception as e:
            self.add_result(CheckResult(
                name="Ollama server",
                status=CheckStatus.WARN,
                message=f"Check failed: {str(e)}",
                fix_command="Ensure Ollama is running: ollama serve"
            ))

    # =========================================================================
    # Check 7: Configuration Validation
    # =========================================================================

    def check_configuration(self):
        """Validate configuration files"""
        self.log(f"\n{Color.BOLD}=== Configuration Validation ==={Color.END}")

        env_file = self.project_root / ".env"
        if not env_file.exists():
            self.add_result(CheckResult(
                name=".env file",
                status=CheckStatus.FAIL,
                message="Not found",
                fix_command="cp .env.example .env"
            ))
            return

        # Check for required environment variables
        required_vars = [
            "DATABASE_URL",
            "AGENT_ALPHA_MODEL",
            "AGENT_BETA_MODEL",
        ]

        env_vars = {}
        with open(env_file) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    key, value = line.split('=', 1)
                    env_vars[key.strip()] = value.strip().strip('"').strip("'")

        missing_vars = []
        for var in required_vars:
            if var not in env_vars:
                missing_vars.append(var)

        if missing_vars:
            self.add_result(CheckResult(
                name="Environment variables",
                status=CheckStatus.FAIL,
                message=f"Missing: {', '.join(missing_vars)}",
                fix_command="Add missing variables to .env"
            ))
        else:
            self.add_result(CheckResult(
                name="Environment variables",
                status=CheckStatus.PASS,
                message="All required variables present"
            ))

    # =========================================================================
    # Check 8: Permissions
    # =========================================================================

    def check_permissions(self):
        """Check file permissions"""
        self.log(f"\n{Color.BOLD}=== File Permissions ==={Color.END}")

        # Check if bootstrap.sh is executable
        bootstrap = self.project_root / "bootstrap.sh"
        if bootstrap.exists():
            if os.access(bootstrap, os.X_OK):
                self.add_result(CheckResult(
                    name="bootstrap.sh",
                    status=CheckStatus.PASS,
                    message="Executable"
                ))
            else:
                self.add_result(CheckResult(
                    name="bootstrap.sh",
                    status=CheckStatus.WARN,
                    message="Not executable",
                    fix_command="chmod +x bootstrap.sh"
                ))

        # Check write permissions for database directory
        prisma_dir = self.project_root / "prisma"
        if prisma_dir.exists():
            if os.access(prisma_dir, os.W_OK):
                self.add_result(CheckResult(
                    name="prisma/ directory",
                    status=CheckStatus.PASS,
                    message="Writable"
                ))
            else:
                self.add_result(CheckResult(
                    name="prisma/ directory",
                    status=CheckStatus.FAIL,
                    message="Not writable",
                    fix_command=f"chmod -R u+w {prisma_dir}"
                ))

    # =========================================================================
    # Summary and Recommendations
    # =========================================================================

    def print_summary(self):
        """Print verification summary"""
        self.log(f"\n{Color.BOLD}{'='*60}{Color.END}")
        self.log(f"{Color.BOLD}VERIFICATION SUMMARY{Color.END}")
        self.log(f"{Color.BOLD}{'='*60}{Color.END}\n")

        total_checks = len(self.results)
        passed = sum(1 for r in self.results if r.status == CheckStatus.PASS)
        warnings = sum(1 for r in self.results if r.status == CheckStatus.WARN)
        failed = sum(1 for r in self.results if r.status == CheckStatus.FAIL)
        skipped = sum(1 for r in self.results if r.status == CheckStatus.SKIP)

        self.log(f"Total Checks:    {total_checks}")
        self.log(f"{Color.GREEN}Passed:          {passed}{Color.END}")
        self.log(f"{Color.YELLOW}Warnings:        {warnings}{Color.END}")
        self.log(f"{Color.RED}Failed:          {failed}{Color.END}")
        self.log(f"{Color.BLUE}Skipped:         {skipped}{Color.END}")

        # Determine overall status
        if failed == 0 and warnings == 0:
            self.log(f"\n{Color.GREEN}{Color.BOLD}✓ INSTALLATION VERIFIED - READY FOR PRODUCTION{Color.END}")
            return 0
        elif failed == 0:
            self.log(f"\n{Color.YELLOW}{Color.BOLD}⚠ INSTALLATION COMPLETE WITH WARNINGS{Color.END}")
            self.log(f"The system is functional but some optional features may not work.")
            return 0
        else:
            self.log(f"\n{Color.RED}{Color.BOLD}✗ INSTALLATION INCOMPLETE{Color.END}")
            self.log(f"Critical issues must be resolved before the system can be used.")

            # Print fix recommendations
            self.log(f"\n{Color.BOLD}Recommended Actions:{Color.END}")
            for i, result in enumerate(self.results, 1):
                if result.status == CheckStatus.FAIL and result.fix_command:
                    self.log(f"  {i}. {result.name}:")
                    self.log(f"     {Color.YELLOW}{result.fix_command}{Color.END}")

            return 1

    # =========================================================================
    # Run All Checks
    # =========================================================================

    def run_all_checks(self) -> int:
        """Execute all verification checks"""
        self.log(f"{Color.BOLD}ALCS Installation Verification{Color.END}")
        self.log(f"Project Root: {self.project_root}")
        self.log(f"Verbose: {self.verbose}")
        self.log(f"Auto-fix: {self.auto_fix}\n")

        try:
            self.check_project_structure()
            self.check_nodejs()
            self.check_dependencies()
            self.check_build()
            self.check_database()
            self.check_ollama()
            self.check_configuration()
            self.check_permissions()

            return self.print_summary()

        except KeyboardInterrupt:
            self.log(f"\n{Color.YELLOW}Verification interrupted by user{Color.END}")
            return 130
        except Exception as e:
            self.log(f"\n{Color.RED}Verification failed with error: {str(e)}{Color.END}")
            if self.verbose:
                import traceback
                traceback.print_exc()
            return 1

def main():
    import argparse

    parser = argparse.ArgumentParser(
        description="ALCS Installation Verification - Autonomous smoke testing for AI agents"
    )
    parser.add_argument(
        "-v", "--verbose",
        action="store_true",
        help="Show verbose output with detailed information"
    )
    parser.add_argument(
        "--fix",
        action="store_true",
        help="Attempt to automatically fix issues (not yet implemented)"
    )

    args = parser.parse_args()

    verifier = InstallationVerifier(verbose=args.verbose, auto_fix=args.fix)
    exit_code = verifier.run_all_checks()

    sys.exit(exit_code)

if __name__ == "__main__":
    main()
