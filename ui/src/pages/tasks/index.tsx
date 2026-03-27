import { Navigate } from 'react-router-dom';

export default function TasksRedirect() {
  return <Navigate to="board" replace />;
}
