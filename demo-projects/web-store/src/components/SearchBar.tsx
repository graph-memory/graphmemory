/**
 * Search bar component for the ShopFlow Web Store.
 *
 * Renders a search input with debounced autocomplete suggestions,
 * recent search history, and keyboard navigation support.
 * Designed for use in the header navigation bar.
 * @module components/SearchBar
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useSearch } from '@/hooks/useSearch';

/** Props for the SearchBar component */
interface SearchBarProps {
  placeholder?: string;
  onResultSelect?: (productId: string) => void;
  className?: string;
}

/**
 * SearchBar with autocomplete dropdown, recent searches, and keyboard nav.
 * Arrow keys navigate suggestions; Enter triggers search; Escape closes dropdown.
 */
export const SearchBar: React.FC<SearchBarProps> = ({
  placeholder = 'Search products...',
  onResultSelect,
  className = '',
}) => {
  const { query, setQuery, suggestions, recentSearches, isSearching, executeSearch, clearResults } = useSearch();
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  /** Combined list: suggestions when typing, recent searches when empty */
  const displayItems = query.length > 0
    ? suggestions
    : recentSearches.slice(0, 5).map((s) => s);

  /** Handle input value changes and show dropdown */
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setQuery(e.target.value);
      setIsOpen(true);
      setActiveIndex(-1);
    },
    [setQuery]
  );

  /** Submit search on Enter or navigate suggestions with arrow keys */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((prev) => Math.min(prev + 1, displayItems.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((prev) => Math.max(prev - 1, -1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (activeIndex >= 0 && displayItems[activeIndex]) {
          setQuery(displayItems[activeIndex]);
          executeSearch(displayItems[activeIndex]);
        } else {
          executeSearch();
        }
        setIsOpen(false);
      } else if (e.key === 'Escape') {
        setIsOpen(false);
        inputRef.current?.blur();
      }
    },
    [activeIndex, displayItems, setQuery, executeSearch]
  );

  /** Select a suggestion from the dropdown */
  const handleSuggestionClick = useCallback(
    (item: string) => {
      setQuery(item);
      executeSearch(item);
      setIsOpen(false);
    },
    [setQuery, executeSearch]
  );

  /** Close dropdown when clicking outside */
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className={`search-bar ${className}`} ref={dropdownRef} role="combobox" aria-expanded={isOpen}>
      <div className="search-bar__input-wrapper">
        <input
          ref={inputRef}
          type="search"
          className="search-bar__input"
          value={query}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsOpen(true)}
          placeholder={placeholder}
          aria-label="Search products"
          aria-autocomplete="list"
          aria-controls="search-suggestions"
          aria-activedescendant={activeIndex >= 0 ? `suggestion-${activeIndex}` : undefined}
          role="searchbox"
        />
        {isSearching && <span className="search-bar__spinner" aria-hidden="true" />}
        {query && (
          <button className="search-bar__clear" onClick={clearResults} aria-label="Clear search">
            &times;
          </button>
        )}
      </div>

      {isOpen && displayItems.length > 0 && (
        <ul id="search-suggestions" className="search-bar__dropdown" role="listbox">
          {displayItems.map((item, idx) => (
            <li
              key={item}
              id={`suggestion-${idx}`}
              className={`search-bar__suggestion ${idx === activeIndex ? 'search-bar__suggestion--active' : ''}`}
              role="option"
              aria-selected={idx === activeIndex}
              onClick={() => handleSuggestionClick(item)}
              onMouseEnter={() => setActiveIndex(idx)}
            >
              {query.length === 0 && <span className="search-bar__icon-recent" aria-hidden="true" />}
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
