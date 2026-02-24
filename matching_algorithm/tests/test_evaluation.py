import pytest
import numpy as np
from evaluation import EvaluationMetrics, MatchingEvaluator


class TestPrecisionMetrics:
    def test_perfect_precision(self):
        evaluator = MatchingEvaluator()
        recommended = [1, 2, 3, 4, 5]
        relevant = {1, 2, 3, 4, 5, 6, 7, 8}
        
        precision = evaluator.precision_at_k(recommended, relevant, k=5)
        assert precision == 1.0
    
    def test_partial_precision(self):
        evaluator = MatchingEvaluator()
        recommended = [1, 2, 3, 99, 98]
        relevant = {1, 2, 3, 4, 5}
        
        precision = evaluator.precision_at_k(recommended, relevant, k=5)
        assert precision == 0.6
    
    def test_zero_precision(self):
        evaluator = MatchingEvaluator()
        recommended = [99, 98, 97, 96, 95]
        relevant = {1, 2, 3, 4, 5}
        
        precision = evaluator.precision_at_k(recommended, relevant, k=5)
        assert precision == 0.0
    
    def test_k_larger_than_recommendations(self):
        evaluator = MatchingEvaluator()
        recommended = [1, 2, 3]
        relevant = {1, 2, 3, 4, 5}
        
        precision = evaluator.precision_at_k(recommended, relevant, k=5)
        assert precision == 0.6


class TestRecallMetrics:
    def test_perfect_recall(self):
        evaluator = MatchingEvaluator()
        recommended = [1, 2, 3, 4, 5, 6, 7, 8]
        relevant = {1, 2, 3, 4, 5}
        
        recall = evaluator.recall_at_k(recommended, relevant, k=8)
        assert recall == 1.0
    
    def test_partial_recall(self):
        evaluator = MatchingEvaluator()
        recommended = [1, 2, 3, 99, 98]
        relevant = {1, 2, 3, 4, 5}
        
        recall = evaluator.recall_at_k(recommended, relevant, k=5)
        assert recall == 0.6
    
    def test_zero_recall(self):
        evaluator = MatchingEvaluator()
        recommended = [99, 98, 97, 96, 95]
        relevant = {1, 2, 3, 4, 5}
        
        recall = evaluator.recall_at_k(recommended, relevant, k=5)
        assert recall == 0.0
    
    def test_empty_relevant_set(self):
        evaluator = MatchingEvaluator()
        recommended = [1, 2, 3, 4, 5]
        relevant = set()
        
        recall = evaluator.recall_at_k(recommended, relevant, k=5)
        assert recall == 0.0


class TestF1Metrics:
    def test_perfect_f1(self):
        evaluator = MatchingEvaluator()
        recommended = [1, 2, 3, 4, 5]
        relevant = {1, 2, 3, 4, 5}
        
        f1 = evaluator.f1_at_k(recommended, relevant, k=5)
        assert f1 == 1.0
    
    def test_balanced_f1(self):
        evaluator = MatchingEvaluator()
        recommended = [1, 2, 99, 98, 97]
        relevant = {1, 2, 3, 4, 5}
        
        precision = 2/5
        recall = 2/5
        expected_f1 = 2 * (precision * recall) / (precision + recall)
        
        f1 = evaluator.f1_at_k(recommended, relevant, k=5)
        assert np.isclose(f1, expected_f1)
    
    def test_zero_f1(self):
        evaluator = MatchingEvaluator()
        recommended = [99, 98, 97, 96, 95]
        relevant = {1, 2, 3, 4, 5}
        
        f1 = evaluator.f1_at_k(recommended, relevant, k=5)
        assert f1 == 0.0


class TestMeanReciprocalRank:
    def test_first_position(self):
        evaluator = MatchingEvaluator()
        recommended = [1, 2, 3, 4, 5]
        relevant = {1}
        
        mrr = evaluator.mean_reciprocal_rank(recommended, relevant)
        assert mrr == 1.0
    
    def test_second_position(self):
        evaluator = MatchingEvaluator()
        recommended = [99, 1, 2, 3, 4]
        relevant = {1}
        
        mrr = evaluator.mean_reciprocal_rank(recommended, relevant)
        assert mrr == 0.5
    
    def test_tenth_position(self):
        evaluator = MatchingEvaluator()
        recommended = [99] * 9 + [1]
        relevant = {1}
        
        mrr = evaluator.mean_reciprocal_rank(recommended, relevant)
        assert mrr == 0.1
    
    def test_no_relevant_found(self):
        evaluator = MatchingEvaluator()
        recommended = [99, 98, 97, 96, 95]
        relevant = {1}
        
        mrr = evaluator.mean_reciprocal_rank(recommended, relevant)
        assert mrr == 0.0
    
    def test_multiple_relevant(self):
        evaluator = MatchingEvaluator()
        recommended = [99, 1, 2, 3, 4]
        relevant = {1, 2, 3}
        
        mrr = evaluator.mean_reciprocal_rank(recommended, relevant)
        assert mrr == 0.5


class TestNDCG:
    def test_perfect_ranking(self):
        evaluator = MatchingEvaluator()
        recommended = [1, 2, 3, 4, 5]
        relevant = {1, 2, 3, 4, 5}
        
        ndcg = evaluator.ndcg_at_k(recommended, relevant, k=5)
        assert ndcg == 1.0
    
    def test_reverse_ranking(self):
        evaluator = MatchingEvaluator()
        recommended = [5, 4, 3, 2, 1]
        relevant = {1, 2, 3, 4, 5}
        
        ndcg = evaluator.ndcg_at_k(recommended, relevant, k=5)
        assert ndcg == 1.0
    
    def test_no_relevant(self):
        evaluator = MatchingEvaluator()
        recommended = [99, 98, 97, 96, 95]
        relevant = {1, 2, 3, 4, 5}
        
        ndcg = evaluator.ndcg_at_k(recommended, relevant, k=5)
        assert ndcg == 0.0
    
    def test_partial_relevant(self):
        evaluator = MatchingEvaluator()
        recommended = [1, 99, 2, 98, 3]
        relevant = {1, 2, 3, 4, 5}
        
        ndcg = evaluator.ndcg_at_k(recommended, relevant, k=5)
        assert 0.0 < ndcg < 1.0


class TestHitRate:
    def test_hit_at_first(self):
        evaluator = MatchingEvaluator()
        recommended = [1, 2, 3, 4, 5]
        relevant = {1}
        
        hit_rate = evaluator.hit_rate_at_k(recommended, relevant, k=5)
        assert hit_rate == 1.0
    
    def test_hit_at_last(self):
        evaluator = MatchingEvaluator()
        recommended = [99, 98, 97, 96, 1]
        relevant = {1}
        
        hit_rate = evaluator.hit_rate_at_k(recommended, relevant, k=5)
        assert hit_rate == 1.0
    
    def test_no_hit(self):
        evaluator = MatchingEvaluator()
        recommended = [99, 98, 97, 96, 95]
        relevant = {1}
        
        hit_rate = evaluator.hit_rate_at_k(recommended, relevant, k=5)
        assert hit_rate == 0.0
    
    def test_hit_beyond_k(self):
        evaluator = MatchingEvaluator()
        recommended = [99, 98, 97, 96, 95, 1]
        relevant = {1}
        
        hit_rate = evaluator.hit_rate_at_k(recommended, relevant, k=5)
        assert hit_rate == 0.0


class TestEvaluateQuery:
    def test_full_evaluation(self):
        evaluator = MatchingEvaluator()
        recommended = [1, 2, 3, 99, 98]
        relevant = {1, 2, 3, 4, 5}
        
        precision_3 = evaluator.precision_at_k(recommended, relevant, k=3)
        precision_5 = evaluator.precision_at_k(recommended, relevant, k=5)
        recall_3 = evaluator.recall_at_k(recommended, relevant, k=3)
        recall_5 = evaluator.recall_at_k(recommended, relevant, k=5)
        mrr = evaluator.mean_reciprocal_rank(recommended, relevant)
        
        assert precision_3 == 1.0
        assert precision_5 == 0.6
        assert recall_3 == 0.6
        assert recall_5 == 0.6
        assert mrr == 1.0


class TestEvaluateDataset:
    def test_evaluate_dataset_structure(self):
        evaluator = MatchingEvaluator()
        
        precision_5 = 0.8
        recall_5 = 0.6
        
        assert precision_5 > recall_5
        assert 0 <= precision_5 <= 1
        assert 0 <= recall_5 <= 1


class TestEdgeCases:
    def test_empty_recommendations(self):
        evaluator = MatchingEvaluator()
        recommended = []
        relevant = {1, 2, 3}
        
        precision = evaluator.precision_at_k(recommended, relevant, k=5)
        recall = evaluator.recall_at_k(recommended, relevant, k=5)
        f1 = evaluator.f1_at_k(recommended, relevant, k=5)
        mrr = evaluator.mean_reciprocal_rank(recommended, relevant)
        ndcg = evaluator.ndcg_at_k(recommended, relevant, k=5)
        
        assert precision == 0.0
        assert recall == 0.0
        assert f1 == 0.0
        assert mrr == 0.0
        assert ndcg == 0.0
    
    def test_k_equals_zero(self):
        evaluator = MatchingEvaluator()
        recommended = [1, 2, 3, 4, 5]
        relevant = {1, 2, 3}
        
        precision = evaluator.precision_at_k(recommended, relevant, k=0)
        recall = evaluator.recall_at_k(recommended, relevant, k=0)
        
        assert precision == 0.0
        assert recall == 0.0
