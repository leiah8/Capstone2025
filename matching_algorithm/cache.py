from __future__ import annotations
import collections
import hashlib
import json
import logging
import os
from typing import Optional, List, Any

import numpy as np

try:
    import redis
    REDIS_AVAILABLE = True
except ImportError:
    REDIS_AVAILABLE = False

logger = logging.getLogger(__name__)

# In-process LRU cache used when Redis is unavailable.
# Keyed by the same SHA256 hash used for Redis, bounded to avoid unbounded growth.
_MEM_CACHE_MAX = int(os.getenv("MEM_CACHE_MAX_ENTRIES", "1024"))
_mem_cache: collections.OrderedDict[str, np.ndarray] = collections.OrderedDict()


def _mem_get(key: str) -> Optional[np.ndarray]:
    if key not in _mem_cache:
        return None
    # Move to end to mark as recently used
    _mem_cache.move_to_end(key)
    return _mem_cache[key]


def _mem_set(key: str, embedding: np.ndarray) -> None:
    _mem_cache[key] = embedding
    _mem_cache.move_to_end(key)
    if len(_mem_cache) > _MEM_CACHE_MAX:
        _mem_cache.popitem(last=False)  # evict oldest


class EmbeddingCache:
    """
    Redis-backed cache for sentence embeddings with graceful fallback.

    Cache keys are SHA256 hashes of normalized text to ensure consistency.
    Embeddings are stored as JSON arrays for portability.
    """

    def __init__(
        self,
        redis_host: Optional[str] = None,
        redis_port: Optional[int] = None,
        redis_db: int = 0,
        ttl_seconds: int = 86400,  # 24 hours default
        enabled: bool = True
    ):
        self.enabled = enabled and REDIS_AVAILABLE
        self.ttl_seconds = ttl_seconds
        self.client: Optional[redis.Redis] = None

        if not REDIS_AVAILABLE:
            logger.warning("Redis library not available. Embedding cache disabled.")
            self.enabled = False
            return

        if not enabled:
            logger.info("Embedding cache explicitly disabled.")
            return

        # Get Redis config from environment or parameters
        host = redis_host or os.getenv("REDIS_HOST", "localhost")
        port = redis_port or int(os.getenv("REDIS_PORT", "6379"))
        password = os.getenv("REDIS_PASSWORD")

        try:
            self.client = redis.Redis(
                host=host,
                port=port,
                db=redis_db,
                password=password,
                socket_connect_timeout=2,
                socket_timeout=2,
                decode_responses=False  # We'll handle encoding ourselves
            )
            # Test connection
            self.client.ping()
            logger.info(f"Embedding cache enabled: redis://{host}:{port}/{redis_db}")
        except Exception as e:
            logger.warning(f"Failed to connect to Redis: {e}. Cache disabled.")
            self.enabled = False
            self.client = None

    def _generate_cache_key(self, text: str, prefix: str = "emb") -> str:
        """Generate a cache key from text using SHA256 hash."""
        # Normalize text for consistent caching
        normalized = " ".join(text.split())
        hash_obj = hashlib.sha256(normalized.encode('utf-8'))
        return f"{prefix}:{hash_obj.hexdigest()}"

    def get(self, text: str) -> Optional[np.ndarray]:
        """
        Retrieve embedding from cache.

        Returns None if cache is disabled, key not found, or error occurs.
        Falls back to in-memory LRU cache when Redis is unavailable.
        """
        key = self._generate_cache_key(text)

        if not self.enabled or not self.client:
            return _mem_get(key)

        try:
            cached_data = self.client.get(key)

            if cached_data is None:
                return None

            # Deserialize the embedding
            embedding_list = json.loads(cached_data.decode('utf-8'))
            return np.array(embedding_list, dtype=np.float32)

        except Exception as e:
            logger.warning(f"Cache read error: {e}")
            return None

    def set(self, text: str, embedding: np.ndarray) -> bool:
        """
        Store embedding in cache.

        Returns True if successful, False otherwise.
        Falls back to in-memory LRU cache when Redis is unavailable.
        """
        key = self._generate_cache_key(text)

        if not self.enabled or not self.client:
            _mem_set(key, embedding)
            return True

        try:
            # Serialize embedding as JSON array
            embedding_list = embedding.tolist()
            serialized = json.dumps(embedding_list)

            # Store with TTL
            self.client.setex(
                key,
                self.ttl_seconds,
                serialized.encode('utf-8')
            )
            return True

        except Exception as e:
            logger.warning(f"Cache write error: {e}")
            return False

    def get_batch(self, texts: List[str]) -> List[Optional[np.ndarray]]:
        """
        Retrieve multiple embeddings from cache.

        Returns a list with same length as texts, with None for cache misses.
        Falls back to in-memory LRU cache when Redis is unavailable.
        """
        if not self.enabled or not self.client:
            return [_mem_get(self._generate_cache_key(t)) for t in texts]

        try:
            keys = [self._generate_cache_key(text) for text in texts]
            cached_data = self.client.mget(keys)

            results = []
            for data in cached_data:
                if data is None:
                    results.append(None)
                else:
                    try:
                        embedding_list = json.loads(data.decode('utf-8'))
                        results.append(np.array(embedding_list, dtype=np.float32))
                    except Exception:
                        results.append(None)

            return results

        except Exception as e:
            logger.warning(f"Batch cache read error: {e}")
            return [None] * len(texts)

    def set_batch(self, texts: List[str], embeddings: List[np.ndarray]) -> int:
        """
        Store multiple embeddings in cache.

        Returns the number of successfully cached embeddings.
        """
        if not self.enabled or not self.client:
            for text, embedding in zip(texts, embeddings):
                _mem_set(self._generate_cache_key(text), embedding)
            return len(texts)

        if len(texts) != len(embeddings):
            logger.error("Text and embedding lists must have same length")
            return 0

        try:
            pipeline = self.client.pipeline()

            for text, embedding in zip(texts, embeddings):
                key = self._generate_cache_key(text)
                embedding_list = embedding.tolist()
                serialized = json.dumps(embedding_list)
                pipeline.setex(
                    key,
                    self.ttl_seconds,
                    serialized.encode('utf-8')
                )

            pipeline.execute()
            return len(texts)

        except Exception as e:
            logger.warning(f"Batch cache write error: {e}")
            return 0

    def clear(self) -> bool:
        """Clear all embeddings from cache (use with caution in production)."""
        if not self.enabled or not self.client:
            return False

        try:
            # Only clear keys with our prefix to avoid deleting unrelated data
            cursor = 0
            count = 0
            while True:
                cursor, keys = self.client.scan(cursor, match="emb:*", count=100)
                if keys:
                    self.client.delete(*keys)
                    count += len(keys)
                if cursor == 0:
                    break

            logger.info(f"Cleared {count} embeddings from cache")
            return True

        except Exception as e:
            logger.error(f"Failed to clear cache: {e}")
            return False

    def get_stats(self) -> dict[str, Any]:
        """Get cache statistics."""
        if not self.enabled or not self.client:
            return {"enabled": False}

        try:
            info = self.client.info("stats")
            return {
                "enabled": True,
                "total_commands": info.get("total_commands_processed", 0),
                "keyspace_hits": info.get("keyspace_hits", 0),
                "keyspace_misses": info.get("keyspace_misses", 0),
                "hit_rate": (
                    info.get("keyspace_hits", 0) /
                    max(info.get("keyspace_hits", 0) + info.get("keyspace_misses", 0), 1)
                )
            }
        except Exception as e:
            logger.warning(f"Failed to get cache stats: {e}")
            return {"enabled": True, "error": str(e)}


_cache_instance: Optional[EmbeddingCache] = None


def get_embedding_cache() -> EmbeddingCache:
    """Get or create singleton cache instance.

    Only enables caching when REDIS_HOST is explicitly set in the environment.
    Also reads REDIS_DB and CACHE_TTL_SECONDS from env.
    """
    global _cache_instance
    if _cache_instance is None:
        redis_host = os.getenv("REDIS_HOST", "").strip()
        enabled = bool(redis_host)
        redis_db = int(os.getenv("REDIS_DB", "0"))
        ttl_seconds = int(os.getenv("CACHE_TTL_SECONDS", "86400"))
        _cache_instance = EmbeddingCache(
            redis_host=redis_host if redis_host else None,
            redis_db=redis_db,
            ttl_seconds=ttl_seconds,
            enabled=enabled,
        )
    return _cache_instance
