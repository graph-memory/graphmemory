import { useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Switch from '@mui/material/Switch';
import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';
import Chip from '@mui/material/Chip';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { STACK_DOMAINS, type StackDomainDef } from '@/content/prompts/stackCatalog.ts';
import { useBuilderContext } from '../context/BuilderContext.tsx';
import SectionToggle from './SectionToggle.tsx';

export default function StackTab() {
  const { state, dispatch, ensureSectionEnabled } = useBuilderContext();
  const { enabledDomains, selections } = state.stack;
  const [activeDomain, setActiveDomain] = useState<string | null>(
    enabledDomains.length > 0 ? enabledDomains[0] : STACK_DOMAINS[0].id,
  );

  /** Bulk-disable: clear all selections for a domain and cascade up to section */
  const disableDomain = (domain: StackDomainDef) => {
    const count = getDomainCount(domain);
    if (count === 0) return; // guard: nothing to disable
    const keys = domain.categories.map(c => `${domain.id}.${c.key}`);
    dispatch({
      type: 'SET_STACK_DOMAIN_ALL',
      domainId: domain.id,
      enabled: false,
      keys,
      allOptions: {},
    });
    // Cascade up: if no selections remain across all domains, disable stack section
    const totalAfter = STACK_DOMAINS.reduce((sum, d) =>
      sum + (d.id === domain.id ? 0 : getDomainCount(d)), 0);
    if (totalAfter <= 0) {
      const sectionOn = state.promptSections.find(s => s.id === 'stack')?.enabled;
      if (sectionOn) dispatch({ type: 'TOGGLE_SECTION', sectionId: 'stack' });
    }
  };

  /**
   * Toggle a single option within a domain category.
   * Cascading behavior:
   * - Adding: auto-enable domain (if off) and stack section (if off)
   * - Removing: auto-disable domain (if empty) and stack section (if all empty)
   */
  const toggleOption = (domain: StackDomainDef, categoryKey: string, value: string) => {
    const key = `${domain.id}.${categoryKey}`;
    dispatch({ type: 'TOGGLE_STACK_OPTION', key, value });

    const current = selections[key] ?? [];
    const willRemove = current.includes(value);

    if (willRemove) {
      // Cascade down→up: check if domain becomes empty after removal
      const countAfter = getDomainCount(domain) - 1;
      if (countAfter <= 0 && enabledDomains.includes(domain.id)) {
        dispatch({ type: 'TOGGLE_STACK_DOMAIN', domainId: domain.id });
        // Check if ALL domains are now empty → disable stack section
        const totalAfter = STACK_DOMAINS.reduce((sum, d) =>
          sum + (d.id === domain.id ? 0 : getDomainCount(d)), 0);
        if (totalAfter <= 0) {
          dispatch({ type: 'TOGGLE_SECTION', sectionId: 'stack' });
        }
      }
    } else {
      // Cascade up: auto-enable domain and section
      if (!enabledDomains.includes(domain.id)) {
        dispatch({ type: 'TOGGLE_STACK_DOMAIN', domainId: domain.id });
      }
      ensureSectionEnabled('stack');
    }
  };

  const getSelected = (domainId: string, categoryKey: string): string[] => {
    return selections[`${domainId}.${categoryKey}`] ?? [];
  };

  const getDomainCount = (domain: StackDomainDef): number => {
    let count = 0;
    for (const cat of domain.categories) {
      count += (selections[`${domain.id}.${cat.key}`] ?? []).length;
    }
    return count;
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <SectionToggle sectionId="stack" label="Stack" />

      {/* Domain sub-tabs */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.25, borderBottom: 1, borderColor: 'divider', pb: 0.5 }}>
        {STACK_DOMAINS.map(domain => {
          const active = activeDomain === domain.id;
          const enabled = enabledDomains.includes(domain.id);
          const count = getDomainCount(domain);
          return (
            <Box
              key={domain.id}
              role="tab"
              tabIndex={0}
              aria-selected={active}
              aria-label={`${domain.label}${enabled ? ` (${count} selected)` : ' (off)'}`}
              onClick={() => setActiveDomain(domain.id)}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setActiveDomain(domain.id); } }}
              sx={{
                px: 1, py: 0.5, cursor: 'pointer',
                fontSize: '0.7rem', borderRadius: 0.5,
                borderBottom: 2,
                borderColor: active ? 'primary.main' : 'transparent',
                color: enabled ? 'primary.main' : 'text.disabled',
                display: 'flex', alignItems: 'center', gap: 0.5,
                '&:hover': { color: 'primary.main' },
              }}
            >
              {domain.label.split(' ')[0]}
              {count > 0 && (
                <Chip label={count} size="small" sx={{ height: 16, fontSize: '0.6rem', minWidth: 20 }} />
              )}
            </Box>
          );
        })}
      </Box>

      {/* Active domain content */}
      {STACK_DOMAINS.filter(d => d.id === activeDomain).map(domain => {
        const enabled = enabledDomains.includes(domain.id);
        const count = getDomainCount(domain);
        return (
          <Box key={domain.id} sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {/* Domain toggle — only works as disable (clear all) */}
            <Box sx={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              px: 1, py: 0.5, border: 1, borderRadius: 1,
              borderColor: enabled ? 'primary.main' : 'divider',
              bgcolor: enabled ? 'action.selected' : 'transparent',
            }}>
              <Typography variant="caption" sx={{ fontWeight: 600, color: enabled ? 'primary.main' : 'text.secondary' }}>
                {domain.label}
                {count > 0 && <Typography component="span" variant="caption" sx={{ ml: 0.5, opacity: 0.6 }}>({count})</Typography>}
              </Typography>
              <Switch
                checked={enabled}
                disabled={count === 0}
                onChange={() => disableDomain(domain)}
                size="small"
                inputProps={{ 'aria-label': `Disable all ${domain.label}` }}
              />
            </Box>

            {/* Categories as accordions */}
            {domain.categories.map(cat => {
              const selected = getSelected(domain.id, cat.key);
              return (
                <Accordion
                  key={cat.key}
                  defaultExpanded={selected.length > 0}
                  disableGutters
                  slotProps={{ transition: { unmountOnExit: true } }}
                  sx={{ '&:before': { display: 'none' }, boxShadow: 'none', border: 1, borderColor: 'divider', borderRadius: '4px !important' }}
                >
                  <AccordionSummary
                    expandIcon={<ExpandMoreIcon sx={{ fontSize: 16 }} />}
                    sx={{ minHeight: 32, '& .MuiAccordionSummary-content': { my: 0.25 } }}
                  >
                    <Typography variant="caption" sx={{ fontWeight: 600, flex: 1 }}>
                      {cat.label}
                    </Typography>
                    {selected.length > 0 && (
                      <Chip label={selected.length} size="small" sx={{ height: 16, fontSize: '0.6rem', mr: 1 }} />
                    )}
                  </AccordionSummary>
                  <AccordionDetails sx={{ pt: 0, pb: 1, px: 1 }}>
                    {cat.options.map(opt => {
                      const active = selected.includes(opt);
                      return (
                        <Box
                          key={opt}
                          onClick={() => toggleOption(domain, cat.key, opt)}
                          sx={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            py: 0.75, px: 1,
                            cursor: 'pointer',
                            '&:hover': { bgcolor: 'action.hover' },
                            borderRadius: 1,
                            borderBottom: 1, borderColor: 'divider',
                            '&:last-child': { borderBottom: 0 },
                          }}
                        >
                          <Typography variant="body2" sx={{ color: active ? 'text.primary' : 'text.secondary', fontWeight: active ? 500 : 400 }}>
                            {opt}
                          </Typography>
                          <Switch
                            checked={active}
                            size="small"
                            inputProps={{ 'aria-label': `Toggle ${opt}` }}
                            tabIndex={-1}
                          />
                        </Box>
                      );
                    })}
                  </AccordionDetails>
                </Accordion>
              );
            })}
          </Box>
        );
      })}
    </Box>
  );
}
