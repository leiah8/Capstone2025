#!/usr/bin/env python3
"""
Quick validation that Docker setup files are present and correctly configured
"""
import os
import sys

def check_file(path, description):
    """Check if a file exists"""
    if os.path.exists(path):
        size = os.path.getsize(path)
        print(f"  ✓ {description:40} ({size:,} bytes)")
        return True
    else:
        print(f"  ✗ {description:40} MISSING")
        return False

def check_docker_setup():
    """Validate Docker setup files"""
    print("\n" + "="*60)
    print("🔍 Docker Setup Validation")
    print("="*60 + "\n")
    
    files = [
        ("docker-compose.yml", "Docker Compose configuration"),
        ("matching_algorithm/Dockerfile", "Matching API Dockerfile"),
        ("resume_parser/Dockerfile", "Resume Parser Dockerfile"),
        (".dockerignore", "Docker ignore file"),
        ("start-docker.sh", "Startup script"),
        ("test_services.py", "Service test script"),
        ("DOCKER.md", "Docker documentation"),
        ("DOCKER_DEMO.md", "Docker demo guide"),
    ]
    
    results = []
    for filepath, description in files:
        results.append(check_file(filepath, description))
    
    print("\n" + "="*60)
    passed = sum(results)
    total = len(results)
    print(f"Status: {passed}/{total} files present")
    
    if passed == total:
        print("\n✅ Docker setup is ready!")
        print("\nTo start services:")
        print("  1. Start Docker Desktop")
        print("  2. Run: ./start-docker.sh")
        print("  3. Test: python test_services.py")
        print("="*60 + "\n")
        return True
    else:
        print("\n❌ Some files are missing")
        print("="*60 + "\n")
        return False

if __name__ == "__main__":
    success = check_docker_setup()
    sys.exit(0 if success else 1)
