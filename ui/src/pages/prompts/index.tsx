import Box from '@mui/material/Box';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import SimpleBuilder from './simple/SimpleBuilder.tsx';
import AdvancedBuilder from './advanced/AdvancedBuilder.tsx';

export default function PromptsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { projectId } = useParams();

  const isAdvanced = location.pathname.endsWith('/advanced');
  const tab = isAdvanced ? 1 : 0;

  const handleTabChange = (_: unknown, value: number) => {
    const path = value === 1 ? 'prompts/advanced' : 'prompts/simple';
    navigate(`/${projectId}/${path}`);
  };

  return (
    <>
      <Box sx={{ borderBottom: 1, borderColor: 'divider', px: 2 }}>
        <Tabs
          value={tab}
          onChange={handleTabChange}
          sx={{
            minHeight: 40,
            '& .MuiTab-root': { minHeight: 40, textTransform: 'none', fontWeight: 600 },
          }}
        >
          <Tab label="Simple" />
          <Tab label="Advanced" />
        </Tabs>
      </Box>

      <Box sx={{ height: 'calc(100vh - 120px)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {tab === 0 && <SimpleBuilder />}
        {tab === 1 && <AdvancedBuilder />}
      </Box>
    </>
  );
}
