import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";


const NotFound = () => {

    return (
        <div className="flex items-center justify-center min-h-screen p-4">
            <div className="bg-white dark:bg-gray-900 p-8 rounded-lg shadow-lg">
                <h1 className="text-4xl font-bold mb-4 text-center">404</h1>
                <p className="text-gray-600 dark:text-gray-300 mb-6 text-center">
                    The page you're looking for doesn't exist.
                </p>
                <div className="flex justify-center">
                    <Link to="/" className="text-decoration-none">
                        <Button>Go back home</Button>
                    </Link>
                </div>
            </div>
        </div>
    );

};

export default NotFound;