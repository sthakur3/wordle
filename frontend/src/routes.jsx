import { Navigate } from 'react-router-dom'
import App from './App'
import NewGamePage from './pages/NewGamePage'
import PlayPage from './pages/PlayPage'

export const routes = [
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <Navigate to="/play" replace /> },
      { path: 'play', element: <PlayPage /> },
      { path: 'new', element: <NewGamePage /> },
      { path: '*', element: <Navigate to="/play" replace /> },
    ],
  },
]
