import Layout from '@/components/common/Layout';
import Home from '@/pages/home/Home';
import LoginPage from '@/pages/login/login';
import { createBrowserRouter } from 'react-router-dom';
import GuestRoute from './GuestRoute';
import NotFound from './NotFound';
import ProtectedRoute from './ProtectedRoute';


export const router = createBrowserRouter([
    {
        path: '/',
        element: <Layout />,
        children: [
            {
                path: 'login',
                element: (
                    <GuestRoute>
                        <LoginPage />
                    </GuestRoute>
                ),
            },
            {
                element: <ProtectedRoute />,
                children: [
                    {
                        index: true,
                        element: <Home />
                    }
                ]
            },
            { path: '*', element: <NotFound /> },

        ],
    },
]);
