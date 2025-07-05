import Layout from '@/components/common/layout/layout';
import Home from '@/pages/home/Home';
import Login from '@/pages/login/Login';
import Targets from '@/pages/targets/targets';
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
                        <Login />
                    </GuestRoute>
                ),
            },
            {
                element: <ProtectedRoute />,
                children: [
                    {
                        path: '',
                        element: <Home />
                    },
                    {
                        element: <Targets />,
                        path: 'targets'
                    },
                ]
            },
            { path: '*', element: <NotFound /> },

        ],
    },
]);
