/**
 * Search hook for the ShopFlow Web Store.
 *
 * Provides debounced search with autocomplete suggestions,
 * result caching, and recent search history integration.
 * Designed to power the SearchBar component with minimal re-renders.
 * @module hooks/useSearch
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import type { SearchResult } from '@/types';
import { get } from '@/services/api-client';
import { addSearchQuery, getSearchHistory } from '@/services/storage';

const DEBOUNCE_MS = 300;
const SUGGESTION_LIMIT = 8;
const CACHE_MAX_SIZE = 50;

/** Return type for the useSearch hook */
export interface UseSearchReturn {
  query: string;
  setQuery: (q: string) => void;
  results: SearchResult[];
  suggestions: string[];
  recentSearches: string[];
  isSearching: boolean;
  error: string | null;
  executeSearch: (q?: string) => Promise<void>;
  clearResults: () => void;
}

/**
 * Hook managing search state with debounced suggestions and result caching.
 * Suggestions are fetched as the user types; full results on explicit search.
 */
export function useSearch(): UseSearchReturn {
  const [query, setQueryState] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [recentSearches, setRecentSearches] = useState<string[]>(() => getSearchHistory());
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resultCache = useRef<Map<string, SearchResult[]>>(new Map());
  const suggestionCache = useRef<Map<string, string[]>>(new Map());

  /** Fetch autocomplete suggestions for the current partial query */
  const fetchSuggestions = useCallback(async (partial: string) => {
    if (partial.length < 2) {
      setSuggestions([]);
      return;
    }
    const cached = suggestionCache.current.get(partial);
    if (cached) {
      setSuggestions(cached);
      return;
    }
    try {
      const data = await get<{ suggestions: string[] }>('/search/suggest', {
        q: partial,
        limit: SUGGESTION_LIMIT.toString(),
      });
      suggestionCache.current.set(partial, data.suggestions);
      if (suggestionCache.current.size > CACHE_MAX_SIZE) {
        const firstKey = suggestionCache.current.keys().next().value!;
        suggestionCache.current.delete(firstKey);
      }
      setSuggestions(data.suggestions);
    } catch {
      setSuggestions([]);
    }
  }, []);

  /** Update the query and trigger debounced suggestion fetching */
  const setQuery = useCallback(
    (q: string) => {
      setQueryState(q);
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(() => fetchSuggestions(q), DEBOUNCE_MS);
    },
    [fetchSuggestions]
  );

  /** Execute a full search and cache the results */
  const executeSearch = useCallback(
    async (q?: string) => {
      const searchQuery = (q ?? query).trim();
      if (!searchQuery) return;

      const cached = resultCache.current.get(searchQuery);
      if (cached) {
        setResults(cached);
        return;
      }

      setIsSearching(true);
      setError(null);
      try {
        const data = await get<{ results: SearchResult[] }>('/search', { q: searchQuery });
        resultCache.current.set(searchQuery, data.results);
        if (resultCache.current.size > CACHE_MAX_SIZE) {
          const firstKey = resultCache.current.keys().next().value!;
          resultCache.current.delete(firstKey);
        }
        setResults(data.results);
        addSearchQuery(searchQuery);
        setRecentSearches(getSearchHistory());
        setSuggestions([]);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Search failed');
      } finally {
        setIsSearching(false);
      }
    },
    [query]
  );

  const clearResults = useCallback(() => {
    setResults([]);
    setSuggestions([]);
    setQueryState('');
  }, []);

  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, []);

  return {
    query, setQuery, results, suggestions, recentSearches,
    isSearching, error, executeSearch, clearResults,
  };
}
