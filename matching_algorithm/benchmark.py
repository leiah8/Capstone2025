from __future__ import annotations
import random
from typing import List, Dict, Any, Set, Tuple
import numpy as np

from matching import get_matching_engine
from evaluation import MatchingEvaluator, EvaluationMetrics, save_evaluation_report


SKILLS_POOL = [
    "Python", "JavaScript", "TypeScript", "React", "Node.js", "Java", "C++",
    "Machine Learning", "Deep Learning", "NLP", "Computer Vision", "Data Science",
    "Docker", "Kubernetes", "AWS", "Azure", "GCP", "PostgreSQL", "MongoDB",
    "FastAPI", "Django", "Flask", "Spring Boot", "GraphQL", "REST API",
    "Git", "CI/CD", "Testing", "Agile", "Scrum", "UI/UX Design",
]

INTERESTS_POOL = [
    "AI", "Web Development", "Mobile Apps", "Gaming", "Startups",
    "Open Source", "Data Science", "Cloud Computing", "DevOps",
    "Blockchain", "IoT", "Robotics", "Education", "Healthcare", "FinTech",
]

LOCATIONS = [
    "Toronto, ON", "Vancouver, BC", "Montreal, QC", "Calgary, AB",
    "Ottawa, ON", "Remote", "New York, NY", "San Francisco, CA",
]

EXPERIENCE_LEVELS = ["beginner", "intermediate", "advanced", "expert"]


def generate_user_profile(profile_id: int, skill_expertise: List[str] = None) -> Dict[str, Any]:
    if skill_expertise is None:
        num_skills = random.randint(3, 8)
        skill_expertise = random.sample(SKILLS_POOL, num_skills)
    
    num_interests = random.randint(2, 5)
    interests = random.sample(INTERESTS_POOL, num_interests)
    
    bio_templates = [
        f"Experienced developer specializing in {', '.join(skill_expertise[:2])}. Passionate about {interests[0].lower()}.",
        f"Software engineer with expertise in {skill_expertise[0]}. Looking to work on {interests[0].lower()} projects.",
        f"{skill_expertise[0]} developer interested in building innovative solutions in {interests[0].lower()}.",
    ]
    
    return {
        "id": f"user_{profile_id}",
        "skills": skill_expertise,
        "interests": interests,
        "bio": random.choice(bio_templates),
        "elo_rating": random.uniform(1000, 1400),
        "experience_level": random.choice(EXPERIENCE_LEVELS),
        "location": random.choice(LOCATIONS),
    }


def generate_project(
    project_id: int,
    skill_requirements: List[str] = None,
    is_relevant: bool = False
) -> Dict[str, Any]:
    if skill_requirements is None:
        num_skills = random.randint(2, 5)
        skill_requirements = random.sample(SKILLS_POOL, num_skills)
    
    num_tags = random.randint(2, 4)
    tags = random.sample(INTERESTS_POOL, num_tags)
    
    num_nice_to_have = random.randint(1, 3)
    nice_to_have = random.sample(SKILLS_POOL, num_nice_to_have)
    
    project_names = [
        "AI Chatbot Platform",
        "E-commerce Web App",
        "Mobile Game",
        "Data Analytics Dashboard",
        "Social Media Platform",
        "IoT Smart Home System",
        "Healthcare Management System",
        "EdTech Learning Platform",
    ]
    
    description_templates = [
        f"Building a {project_names[project_id % len(project_names)].lower()} using {skill_requirements[0]} and {skill_requirements[1] if len(skill_requirements) > 1 else 'modern technologies'}. We need help with development and deployment.",
        f"Innovative project focused on {tags[0].lower()}. Looking for developers skilled in {', '.join(skill_requirements[:2])}.",
        f"Startup project in the {tags[0].lower()} space. Building with {skill_requirements[0]} stack.",
    ]
    
    return {
        "id": str(project_id),
        "title": project_names[project_id % len(project_names)],
        "description": random.choice(description_templates),
        "skills_needed": skill_requirements,
        "nice_to_have_skills": nice_to_have,
        "tags": tags,
        "elo_rating": random.uniform(1000, 1400) if not is_relevant else random.uniform(1200, 1500),
        "required_experience_level": random.choice(EXPERIENCE_LEVELS),
        "location": random.choice(LOCATIONS),
    }


def generate_test_case_with_ground_truth(
    case_id: int,
    num_projects: int = 50,
    num_relevant: int = 5
) -> Tuple[Dict[str, Any], List[Dict[str, Any]], Set[str]]:
    common_skills = random.sample(SKILLS_POOL, 4)
    common_interests = random.sample(INTERESTS_POOL, 3)
    
    user_profile = generate_user_profile(case_id, skill_expertise=common_skills)
    
    relevant_project_ids = set()
    projects = []
    
    for i in range(num_relevant):
        overlap_skills = random.sample(common_skills, min(3, len(common_skills)))
        project = generate_project(
            case_id * 100 + i,
            skill_requirements=overlap_skills,
            is_relevant=True
        )
        project["tags"] = common_interests[:2]
        projects.append(project)
        relevant_project_ids.add(str(project["id"]))
    
    for i in range(num_projects - num_relevant):
        project = generate_project(case_id * 100 + num_relevant + i)
        projects.append(project)
    
    random.shuffle(projects)
    
    return user_profile, projects, relevant_project_ids


def generate_synthetic_dataset(
    num_test_cases: int = 20,
    num_projects_per_case: int = 50,
    num_relevant_per_case: int = 5
) -> List[Tuple[Dict[str, Any], List[Dict[str, Any]], Set[str]]]:
    dataset = []
    
    for i in range(num_test_cases):
        test_case = generate_test_case_with_ground_truth(
            case_id=i,
            num_projects=num_projects_per_case,
            num_relevant=num_relevant_per_case
        )
        dataset.append(test_case)
    
    return dataset


def run_benchmark(
    num_test_cases: int = 20,
    num_projects: int = 50,
    num_relevant: int = 5,
    output_path: str = "evaluation_report.json"
) -> EvaluationMetrics:
    engine = get_matching_engine()
    evaluator = MatchingEvaluator(engine)
    
    dataset = generate_synthetic_dataset(
        num_test_cases=num_test_cases,
        num_projects_per_case=num_projects,
        num_relevant_per_case=num_relevant
    )
    
    metrics = evaluator.evaluate_dataset(dataset, k_values=[5, 10, 20])
    
    save_evaluation_report(metrics, output_path)
    
    return metrics


if __name__ == "__main__":
    random.seed(42)
    np.random.seed(42)
    
    metrics = run_benchmark(
        num_test_cases=50,
        num_projects=100,
        num_relevant=8
    )
