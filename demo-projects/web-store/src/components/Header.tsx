/**
 * Header navigation bar for the ShopFlow Web Store.
 *
 * Contains the store logo, main navigation links, search bar,
 * cart icon with item count badge, and user account menu.
 * Responsive: collapses to a hamburger menu on mobile viewports.
 * @module components/Header
 */

import React, { useState, useCallback } from 'react';
import { SearchBar } from '@/components/SearchBar';
import type { User } from '@/types';

/** Navigation link definition */
interface NavLink {
  label: string;
  href: string;
}

/** Props for the Header component */
interface HeaderProps {
  user: User | null;
  cartItemCount: number;
  onCartToggle: () => void;
  onNavigate: (path: string) => void;
  onLogout: () => void;
}

/** Primary navigation links displayed in the header bar */
const NAV_LINKS: NavLink[] = [
  { label: 'Shop', href: '/products' },
  { label: 'Categories', href: '/categories' },
  { label: 'Deals', href: '/deals' },
  { label: 'New Arrivals', href: '/new' },
];

/**
 * Header renders the top navigation bar with responsive layout.
 * On mobile, a hamburger button toggles the nav links.
 * The cart icon shows a badge with the current item count.
 */
export const Header: React.FC<HeaderProps> = ({
  user, cartItemCount, onCartToggle, onNavigate, onLogout,
}) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);

  const toggleMobileMenu = useCallback(() => {
    setIsMobileMenuOpen((prev) => !prev);
  }, []);

  const handleNavClick = useCallback(
    (href: string) => {
      onNavigate(href);
      setIsMobileMenuOpen(false);
    },
    [onNavigate]
  );

  const handleUserMenuToggle = useCallback(() => {
    setIsUserMenuOpen((prev) => !prev);
  }, []);

  return (
    <header className="header" role="banner">
      <div className="header__inner">
        <button
          className="header__hamburger"
          onClick={toggleMobileMenu}
          aria-label="Toggle navigation menu"
          aria-expanded={isMobileMenuOpen}
        >
          <span className="header__hamburger-line" />
          <span className="header__hamburger-line" />
          <span className="header__hamburger-line" />
        </button>

        <a
          className="header__logo"
          href="/"
          onClick={(e) => { e.preventDefault(); onNavigate('/'); }}
          aria-label="ShopFlow home"
        >
          ShopFlow
        </a>

        <nav
          className={`header__nav ${isMobileMenuOpen ? 'header__nav--open' : ''}`}
          aria-label="Main navigation"
        >
          <ul className="header__nav-list" role="menubar">
            {NAV_LINKS.map((link) => (
              <li key={link.href} role="none">
                <a
                  href={link.href}
                  role="menuitem"
                  onClick={(e) => { e.preventDefault(); handleNavClick(link.href); }}
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <SearchBar className="header__search" />

        <div className="header__actions">
          <button
            className="header__cart-btn"
            onClick={onCartToggle}
            aria-label={`Shopping cart, ${cartItemCount} items`}
          >
            <svg className="header__cart-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M7 18c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm10 0c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zM7.2 14.8l.1-.2 1.3-2.4h7.2c.7 0 1.4-.4 1.7-1l3.9-7-1.7-1H5.2l-.9-2H1v2h2l3.6 7.6L5.2 14c-.1.3-.2.6-.2 1 0 1.1.9 2 2 2h12v-2H7.4c-.1 0-.2-.1-.2-.2z" />
            </svg>
            {cartItemCount > 0 && (
              <span className="header__cart-badge" aria-hidden="true">{cartItemCount}</span>
            )}
          </button>

          {user ? (
            <div className="header__user-menu">
              <button
                className="header__user-btn"
                onClick={handleUserMenuToggle}
                aria-expanded={isUserMenuOpen}
                aria-haspopup="menu"
              >
                {user.avatar ? (
                  <img src={user.avatar} alt="" className="header__avatar" />
                ) : (
                  <span className="header__avatar-placeholder">
                    {user.firstName.charAt(0)}{user.lastName.charAt(0)}
                  </span>
                )}
              </button>
              {isUserMenuOpen && (
                <ul className="header__user-dropdown" role="menu">
                  <li role="menuitem"><a href="/account" onClick={(e) => { e.preventDefault(); onNavigate('/account'); }}>My Account</a></li>
                  <li role="menuitem"><a href="/orders" onClick={(e) => { e.preventDefault(); onNavigate('/orders'); }}>Orders</a></li>
                  <li role="menuitem"><button onClick={onLogout}>Sign Out</button></li>
                </ul>
              )}
            </div>
          ) : (
            <button className="header__login-btn" onClick={() => onNavigate('/login')}>
              Sign In
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
