import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import CircularProgress from '@mui/material/CircularProgress';
import Box from '@mui/material/Box';
import Layout from '@/widgets/layout/Layout.tsx';
import ProjectRedirect from '@/app/ProjectRedirect.tsx';
import DashboardPage from '@/pages/dashboard/index.tsx';

// Lazy-loaded pages
const KnowledgePage = lazy(() => import('@/pages/knowledge/index.tsx'));
const NoteDetailPage = lazy(() => import('@/pages/knowledge/[noteId].tsx'));
const NoteNewPage = lazy(() => import('@/pages/knowledge/new.tsx'));
const NoteEditPage = lazy(() => import('@/pages/knowledge/edit.tsx'));
const TasksPage = lazy(() => import('@/pages/tasks/index.tsx'));
const TaskDetailPage = lazy(() => import('@/pages/tasks/[taskId].tsx'));
const TaskNewPage = lazy(() => import('@/pages/tasks/new.tsx'));
const TaskEditPage = lazy(() => import('@/pages/tasks/edit.tsx'));
const SkillsPage = lazy(() => import('@/pages/skills/index.tsx'));
const SkillDetailPage = lazy(() => import('@/pages/skills/[skillId].tsx'));
const SkillNewPage = lazy(() => import('@/pages/skills/new.tsx'));
const SkillEditPage = lazy(() => import('@/pages/skills/edit.tsx'));
const DocsPage = lazy(() => import('@/pages/docs/index.tsx'));
const DocDetailPage = lazy(() => import('@/pages/docs/[docId].tsx'));
const FilesPage = lazy(() => import('@/pages/files/index.tsx'));
const FileDetailPage = lazy(() => import('@/pages/files/[filePath].tsx'));
const SearchPage = lazy(() => import('@/pages/search/index.tsx'));
const GraphPage = lazy(() => import('@/pages/graph/index.tsx'));
const ToolsPage = lazy(() => import('@/pages/tools/index.tsx'));
const ToolDetailPage2 = lazy(() => import('@/pages/tools/[toolName].tsx'));
const PromptsPage = lazy(() => import('@/pages/prompts/index.tsx'));
const HelpPage = lazy(() => import('@/pages/help/index.tsx'));
const HelpArticlePage = lazy(() => import('@/pages/help/[articleId].tsx'));

function PageLoader() {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
      <CircularProgress size={32} />
    </Box>
  );
}

export default function App() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/:projectId" element={<Layout />}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="knowledge" element={<KnowledgePage />} />
          <Route path="knowledge/new" element={<NoteNewPage />} />
          <Route path="knowledge/:noteId/edit" element={<NoteEditPage />} />
          <Route path="knowledge/:noteId" element={<NoteDetailPage />} />
          <Route path="tasks" element={<TasksPage />} />
          <Route path="tasks/new" element={<TaskNewPage />} />
          <Route path="tasks/:taskId/edit" element={<TaskEditPage />} />
          <Route path="tasks/:taskId" element={<TaskDetailPage />} />
          <Route path="skills" element={<SkillsPage />} />
          <Route path="skills/new" element={<SkillNewPage />} />
          <Route path="skills/:skillId/edit" element={<SkillEditPage />} />
          <Route path="skills/:skillId" element={<SkillDetailPage />} />
          <Route path="docs" element={<DocsPage />} />
          <Route path="docs/:docId" element={<DocDetailPage />} />
          <Route path="files" element={<FilesPage />} />
          <Route path="files/view/*" element={<FileDetailPage />} />
          <Route path="search" element={<SearchPage />} />
          <Route path="graph" element={<GraphPage />} />
          <Route path="prompts/simple" element={<PromptsPage />} />
          <Route path="prompts/advanced" element={<PromptsPage />} />
          <Route path="prompts" element={<PromptsPage />} />
          <Route path="tools" element={<ToolsPage />} />
          <Route path="tools/:toolName" element={<ToolDetailPage2 />} />
          <Route path="help" element={<HelpPage />} />
          <Route path="help/:articleId" element={<HelpArticlePage />} />
        </Route>
        <Route path="*" element={<ProjectRedirect />} />
      </Routes>
    </Suspense>
  );
}
