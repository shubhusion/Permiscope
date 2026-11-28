import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ConsoleApp } from './App';
import Landing from './Landing';
import './styles.css';
import './landing.css';

const CONSOLE_TABS = ['overview', 'approvals', 'logs', 'chain', 'eval', 'scenario'];

/** The landing page is the site root; the console lives at #/console/*. */
function Root() {
  const isConsole = () => {
    const hash = window.location.hash;
    if (hash.startsWith('#/console/')) return true;
    // Bookmarks from before the landing page existed keep working.
    return CONSOLE_TABS.includes(hash.replace(/^#\//, ''));
  };
  const [console, setConsole] = useState(isConsole);
  useEffect(() => {
    const handler = () => setConsole(isConsole());
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);
  return (
    <>
      <a
        className="skip-link"
        href="#main"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById('main')?.focus();
        }}
      >
        Skip to main content
      </a>
      {console ? <ConsoleApp /> : <Landing />}
    </>
  );
}

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root element');
createRoot(container).render(<Root />);
