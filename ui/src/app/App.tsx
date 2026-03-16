import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from '@/widgets/layout/Layout.tsx';
import ProjectRedirect from '@/app/ProjectRedirect.tsx';
import KnowledgePage from '@/pages/knowledge/index.tsx';
import NoteDetailPage from '@/pages/knowledge/[noteId].tsx';
import NoteNewPage from '@/pages/knowledge/new.tsx';
import NoteEditPage from '@/pages/knowledge/edit.tsx';
import TasksPage from '@/pages/tasks/index.tsx';
import TaskDetailPage from '@/pages/tasks/[taskId].tsx';
import TaskNewPage from '@/pages/tasks/new.tsx';
import TaskEditPage from '@/pages/tasks/edit.tsx';
import SkillsPage from '@/pages/skills/index.tsx';
import SkillDetailPage from '@/pages/skills/[skillId].tsx';
import SkillNewPage from '@/pages/skills/new.tsx';
import SkillEditPage from '@/pages/skills/edit.tsx';
import DocsPage from '@/pages/docs/index.tsx';
import DocDetailPage from '@/pages/docs/[docId].tsx';
import FilesPage from '@/pages/files/index.tsx';
import FileDetailPage from '@/pages/files/[filePath].tsx';
import SearchPage from '@/pages/search/index.tsx';
import GraphPage from '@/pages/graph/index.tsx';
import DashboardPage from '@/pages/dashboard/index.tsx';
import ToolsPage from '@/pages/tools/index.tsx';
import ToolDetailPage2 from '@/pages/tools/[toolName].tsx';
import HelpPage from '@/pages/help/index.tsx';
import HelpArticlePage from '@/pages/help/[articleId].tsx';

export default function App() {
  return (
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
        <Route path="tools" element={<ToolsPage />} />
        <Route path="tools/:toolName" element={<ToolDetailPage2 />} />
        <Route path="help" element={<HelpPage />} />
        <Route path="help/:articleId" element={<HelpArticlePage />} />
      </Route>
      <Route path="*" element={<ProjectRedirect />} />
    </Routes>
  );
}
