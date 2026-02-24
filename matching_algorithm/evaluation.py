from __future__ import annotations
from typing import Dict, List, Any, Tuple, Set
import time
import numpy as np
from dataclasses import dataclass, field
import json

from matching import MatchingEngine, MatchScore


@dataclass
class EvaluationMetrics:
    """Comprehensive evaluation metrics for matching algorithm"""
    precision_at_k: Dict[int, float] = field(default_factory=dict)
    recall_at_k: Dict[int, float] = field(default_factory=dict)
    f1_at_k: Dict[int, float] = field(default_factory=dict)
    mean_reciprocal_rank: float = 0.0
    ndcg_at_k: Dict[int, float] = field(default_factory=dict)
    hit_rate_at_k: Dict[int, float] = field(default_factory=dict)
    coverage: float = 0.0
    diversity: float = 0.0
    avg_latency_ms: float = 0.0
    throughput_qps: float = 0.0
    total_queries: int = 0
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "accuracy_metrics": {
                "precision@k": self.precision_at_k,
                "recall@k": self.recall_at_k,
                "f1@k": self.f1_at_k,
                "mean_reciprocal_rank": round(self.mean_reciprocal_rank, 4),
                "ndcg@k": self.ndcg_at_k,
                "hit_rate@k": self.hit_rate_at_k,
            },
            "diversity_metrics": {
                "coverage": round(self.coverage, 4),
                "diversity": round(self.diversity, 4),
            },
            "performance_metrics": {
                "avg_latency_ms": round(self.avg_latency_ms, 2),
                "throughput_qps": round(self.throughput_qps, 2),
                "total_queries": self.total_queries,
            }
        }
    
    def summary_str(self) -> str:
        lines = [
            "=" * 60,
            "MATCHING ALGORITHM EVALUATION RESULTS",
            "=" * 60,
            "",
            "Accuracy Metrics:",
            f"  Precision@5:  {self.precision_at_k.get(5, 0):.4f}",
            f"  Precision@10: {self.precision_at_k.get(10, 0):.4f}",
            f"  Recall@5:     {self.recall_at_k.get(5, 0):.4f}",
            f"  Recall@10:    {self.recall_at_k.get(10, 0):.4f}",
            f"  F1@5:         {self.f1_at_k.get(5, 0):.4f}",
            f"  F1@10:        {self.f1_at_k.get(10, 0):.4f}",
            f"  MRR:          {self.mean_reciprocal_rank:.4f}",
            f"  NDCG@5:       {self.ndcg_at_k.get(5, 0):.4f}",
            f"  NDCG@10:      {self.ndcg_at_k.get(10, 0):.4f}",
            f"  Hit Rate@5:   {self.hit_rate_at_k.get(5, 0):.4f}",
            f"  Hit Rate@10:  {self.hit_rate_at_k.get(10, 0):.4f}",
            "",
            "Diversity Metrics:",
            f"  Coverage:     {self.coverage:.4f}",
            f"  Diversity:    {self.diversity:.4f}",
            "",
            "Performance Metrics:",
            f"  Avg Latency:  {self.avg_latency_ms:.2f} ms",
            f"  Throughput:   {self.throughput_qps:.2f} queries/sec",
            f"  Total Queries: {self.total_queries}",
            "=" * 60,
        ]
        return "\n".join(lines)


class MatchingEvaluator:
    """
    Evaluates matching algorithm performance using standard IR metrics.
    """
    
    def __init__(self, engine: MatchingEngine = None):
        self.engine = engine
    
    def precision_at_k(
        self,
        recommended: List[str],
        relevant: Set[str],
        k: int
    ) -> float:
        if k <= 0 or not relevant:
            return 0.0
        
        top_k = recommended[:k]
        if not top_k:
            return 0.0
        relevant_in_top_k = sum(1 for item in top_k if item in relevant)
        return relevant_in_top_k / k
    
    def recall_at_k(
        self,
        recommended: List[str],
        relevant: Set[str],
        k: int
    ) -> float:
        if not relevant:
            return 0.0
        
        top_k = recommended[:k]
        relevant_in_top_k = sum(1 for item in top_k if item in relevant)
        return relevant_in_top_k / len(relevant)
    
    def f1_at_k(
        self,
        recommended: List[str],
        relevant: Set[str],
        k: int
    ) -> float:
        prec = self.precision_at_k(recommended, relevant, k)
        rec = self.recall_at_k(recommended, relevant, k)
        
        if prec + rec == 0:
            return 0.0
        
        return 2 * (prec * rec) / (prec + rec)
    
    def mean_reciprocal_rank(
        self,
        recommended: List[str],
        relevant: Set[str]
    ) -> float:
        for idx, item in enumerate(recommended, 1):
            if item in relevant:
                return 1.0 / idx
        return 0.0
    
    def ndcg_at_k(
        self,
        recommended: List[str],
        relevant: Set[str],
        k: int
    ) -> float:
        top_k = recommended[:k]
        
        relevance = [1.0 if item in relevant else 0.0 for item in top_k]
        
        dcg = sum(
            (2 ** rel - 1) / np.log2(idx + 2)
            for idx, rel in enumerate(relevance)
        )
        
        num_relevant_in_topk = sum(relevance)
        ideal_k = min(k, len(relevant))
        ideal_relevance = [1.0] * ideal_k + [0.0] * (k - ideal_k)
        idcg = sum(
            (2 ** rel - 1) / np.log2(idx + 2)
            for idx, rel in enumerate(ideal_relevance)
        )
        
        if idcg == 0:
            return 0.0
        
        return dcg / idcg
    
    def hit_rate_at_k(
        self,
        recommended: List[str],
        relevant: Set[str],
        k: int
    ) -> float:
        top_k = recommended[:k]
        return 1.0 if any(item in relevant for item in top_k) else 0.0
    
    def evaluate_query(
        self,
        user_profile: Dict[str, Any],
        projects: List[Dict[str, Any]],
        ground_truth: Set[str],
        k_values: List[int] = [5, 10, 20]
    ) -> Dict[str, Any]:
        start_time = time.time()
        
        match_scores = self.engine.rank_projects(user_profile, projects)
        recommended_ids = [score.project_id for score in match_scores]
        
        latency_ms = (time.time() - start_time) * 1000
        
        results = {
            "latency_ms": latency_ms,
            "num_recommendations": len(recommended_ids),
        }
        
        for k in k_values:
            results[f"precision@{k}"] = self.precision_at_k(recommended_ids, ground_truth, k)
            results[f"recall@{k}"] = self.recall_at_k(recommended_ids, ground_truth, k)
            results[f"f1@{k}"] = self.f1_at_k(recommended_ids, ground_truth, k)
            results[f"ndcg@{k}"] = self.ndcg_at_k(recommended_ids, ground_truth, k)
            results[f"hit_rate@{k}"] = self.hit_rate_at_k(recommended_ids, ground_truth, k)
        
        results["mrr"] = self.mean_reciprocal_rank(recommended_ids, ground_truth)
        
        return results
    
    def evaluate_dataset(
        self,
        test_cases: List[Tuple[Dict[str, Any], List[Dict[str, Any]], Set[str]]],
        k_values: List[int] = [5, 10, 20]
    ) -> EvaluationMetrics:
        all_results = []
        total_latency = 0.0
        all_recommended_ids = set()
        all_possible_ids = set()
        
        for user_profile, projects, ground_truth in test_cases:
            result = self.evaluate_query(user_profile, projects, ground_truth, k_values)
            all_results.append(result)
            total_latency += result["latency_ms"]
            
            match_scores = self.engine.rank_projects(user_profile, projects)
            all_recommended_ids.update(score.project_id for score in match_scores)
            all_possible_ids.update(p.get("id", str(p)) for p in projects)
        
        metrics = EvaluationMetrics()
        metrics.total_queries = len(test_cases)
        metrics.avg_latency_ms = total_latency / len(test_cases) if test_cases else 0.0
        metrics.throughput_qps = 1000.0 / metrics.avg_latency_ms if metrics.avg_latency_ms > 0 else 0.0
        
        for k in k_values:
            metrics.precision_at_k[k] = np.mean([r[f"precision@{k}"] for r in all_results])
            metrics.recall_at_k[k] = np.mean([r[f"recall@{k}"] for r in all_results])
            metrics.f1_at_k[k] = np.mean([r[f"f1@{k}"] for r in all_results])
            metrics.ndcg_at_k[k] = np.mean([r[f"ndcg@{k}"] for r in all_results])
            metrics.hit_rate_at_k[k] = np.mean([r[f"hit_rate@{k}"] for r in all_results])
        
        metrics.mean_reciprocal_rank = np.mean([r["mrr"] for r in all_results])
        
        metrics.coverage = len(all_recommended_ids) / len(all_possible_ids) if all_possible_ids else 0.0
        
        skill_diversity = self._calculate_diversity(test_cases)
        metrics.diversity = skill_diversity
        
        return metrics
    
    def _calculate_diversity(
        self,
        test_cases: List[Tuple[Dict[str, Any], List[Dict[str, Any]], Set[str]]]
    ) -> float:
        all_skills_recommended = []
        
        for user_profile, projects, ground_truth in test_cases:
            match_scores = self.engine.rank_projects(user_profile, projects)
            top_5_ids = [score.project_id for score in match_scores[:5]]
            
            for project in projects:
                if str(project.get("id")) in top_5_ids:
                    skills = project.get("skills_needed", [])
                    all_skills_recommended.extend(skills)
        
        if not all_skills_recommended:
            return 0.0
        
        unique_skills = len(set(all_skills_recommended))
        total_skills = len(all_skills_recommended)
        
        return unique_skills / total_skills if total_skills > 0 else 0.0


def save_evaluation_report(
    metrics: EvaluationMetrics,
    output_path: str = "evaluation_report.json"
) -> None:
    report = {
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
        "metrics": metrics.to_dict(),
    }
    
    with open(output_path, "w") as f:
        json.dump(report, f, indent=2)
