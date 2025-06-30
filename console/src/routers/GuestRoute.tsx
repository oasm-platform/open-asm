import type { JSX } from "react";

const GuestRoute = ({ children }: { children: JSX.Element }) => {


    return (
        <>{children}</>
    );
};

export default GuestRoute;