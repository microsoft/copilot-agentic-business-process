import { createBrowserRouter, Navigate } from "react-router-dom"
import Layout from "@/pages/_layout"
import NotFoundPage from "@/pages/not-found"
import MyTasksPage from "@/features/tasks/MyTasksPage"
import TaskDetailPage from "@/features/tasks/TaskDetailPage"
import StartTaskDetailPage from "@/features/tasks/StartTaskDetailPage"
import { contextDeepLink } from "@/hooks/context-deep-link"
import InstancesPage from "@/features/instances/InstancesPage"
import InstanceDetailPage from "@/features/instances/InstanceDetailPage"

// IMPORTANT: Do not remove or modify the code below!
// Normalize basename when hosted in Power Apps
const BASENAME = new URL(".", location.href).pathname
if (location.pathname.endsWith("/index.html")) {
  history.replaceState(null, "", BASENAME + location.search + location.hash);
}

const launchTarget = contextDeepLink(Object.fromEntries(new URLSearchParams(location.search)))

export const router = createBrowserRouter([
  {
    path: "/",
    element: <Layout />,
    errorElement: <NotFoundPage />,
    children: [
      { index: true, element: <Navigate to={launchTarget ?? '/tasks'} replace /> },
      { path: "tasks", element: <MyTasksPage /> },
      { path: "tasks/:taskId", element: <TaskDetailPage /> },
      { path: "tasks/start", element: <StartTaskDetailPage /> },
      { path: "tasks/:taskId/start", element: <StartTaskDetailPage /> },
      { path: "tasks/:taskId/assign", element: <StartTaskDetailPage /> },
      { path: "instances", element: <InstancesPage /> },
      { path: "instances/:instanceId", element: <InstanceDetailPage /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
], { 
  basename: BASENAME // IMPORTANT: Set basename for proper routing when hosted in Power Apps
})