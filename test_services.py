#!/usr/bin/env python3
"""
Test script to verify both Python services are working via Docker
"""
import requests
import json
import sys
import time

def test_service(name, url, test_func):
    """Test a service endpoint"""
    print(f"\n{'='*60}")
    print(f"Testing {name}")
    print(f"{'='*60}")
    
    try:
        result = test_func(url)
        print(f"✅ {name} is working!")
        print(f"Response: {json.dumps(result, indent=2)}")
        return True
    except Exception as e:
        print(f"❌ {name} failed: {e}")
        return False


def test_matching_api(base_url):
    """Test matching algorithm API"""
    # Health check
    health = requests.get(f"{base_url}/match/health", timeout=5).json()
    
    # Test matching endpoint
    test_data = {
        "user_profile": {
            "id": "test-user-1",
            "bio": "Experienced Python developer looking for ML projects",
            "skills": ["python", "machine-learning", "docker"],
            "interests": ["ai", "data-science"],
            "elo_rating": 1200,
            "experience_level": "intermediate",
            "location": "San Francisco, CA"
        },
        "projects": [
            {
                "id": "proj-1",
                "name": "ML Pipeline",
                "description": "Build a production ML pipeline for recommendation system",
                "must_have_skills": ["python", "machine-learning"],
                "nice_to_have_skills": ["docker", "kubernetes"],
                "interests": ["ai", "data-science"],
                "elo_rating": 1300,
                "experience_required": "intermediate",
                "location": "San Francisco, CA"
            },
            {
                "id": "proj-2",
                "name": "Web Scraper",
                "description": "Create a web scraper for data collection",
                "must_have_skills": ["javascript", "nodejs"],
                "nice_to_have_skills": ["python"],
                "interests": ["web-dev"],
                "elo_rating": 1100,
                "experience_required": "beginner",
                "location": "New York, NY"
            }
        ],
        "limit": 2
    }
    
    response = requests.post(
        f"{base_url}/match/person-to-project",
        json=test_data,
        timeout=10
    )
    
    matches = response.json()
    
    print(f"\nMatching Results:")
    print(f"Found {matches['count']} matches")
    for match in matches['ranked_projects']:
        print(f"  - Project ID: {match['project_id']} (Score: {match['total_score']:.3f})")
        print(f"    Breakdown: Semantic={match['breakdown']['semantic_similarity']:.2f}, "
              f"Skills={match['breakdown']['must_have_skills']:.2f}, "
              f"Elo={match['breakdown']['elo_rating']:.2f}")
    
    return health


def test_resume_parser_api(base_url):
    """Test resume parser API"""
    health = requests.get(f"{base_url}/health", timeout=5).json()
    print(f"\n✓ Health check passed")
    print(f"  Service: {health.get('service')}")
    print(f"  Version: {health.get('version')}")
    
    return health


def wait_for_services(max_retries=30, delay=2):
    """Wait for services to be ready"""
    print("⏳ Waiting for services to start...")
    
    services = {
        "Matching API": "http://localhost:8000/match/health",
        "Resume Parser": "http://localhost:8001/health"
    }
    
    for attempt in range(max_retries):
        all_ready = True
        for name, url in services.items():
            try:
                response = requests.get(url, timeout=2)
                if response.status_code == 200:
                    print(f"  ✓ {name} ready")
                else:
                    all_ready = False
            except:
                all_ready = False
                if attempt == 0:
                    print(f"  ⏳ {name} not ready yet...")
        
        if all_ready:
            print("\n✅ All services are ready!\n")
            return True
        
        if attempt < max_retries - 1:
            time.sleep(delay)
    
    print("\n❌ Services failed to start in time")
    return False


def main():
    """Run all tests"""
    print("\n" + "="*60)
    print("🐳 DOCKER MICROSERVICES TEST")
    print("="*60)
    
    # Wait for services
    if not wait_for_services():
        sys.exit(1)
    
    # Test services
    results = []
    
    results.append(test_service(
        "Matching Algorithm API",
        "http://localhost:8000",
        test_matching_api
    ))
    
    results.append(test_service(
        "Resume Parser API",
        "http://localhost:8001",
        test_resume_parser_api
    ))
    
    # Summary
    print(f"\n{'='*60}")
    print("SUMMARY")
    print(f"{'='*60}")
    passed = sum(results)
    total = len(results)
    print(f"Tests Passed: {passed}/{total}")
    
    if passed == total:
        print("\n🎉 All services are working correctly!")
        print("\nYou can access:")
        print("  • Matching API:    http://localhost:8000/docs")
        print("  • Resume Parser:   http://localhost:8001/docs")
        print("  • Matching Health: http://localhost:8000/match/health")
        print("  • Parser Health:   http://localhost:8001/health")
        sys.exit(0)
    else:
        print("\n❌ Some tests failed")
        sys.exit(1)


if __name__ == "__main__":
    main()
