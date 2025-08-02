
interface PageProps {
    children?: React.ReactNode;
    title?: string;
}
const Page = ({ children, title }: PageProps) => {
    return (
        <div>
            {title && <h1 className="text-2xl font-bold mb-4">{title}</h1>}
            {children}
        </div>
    );
};

export default Page;