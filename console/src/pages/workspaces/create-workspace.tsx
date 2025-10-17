import CreateWorkspaceDialog from "./create-workspace-dialog";

const CreateWorkspace = () => {
    return (
        <div className="h-[50vh] w-full md:w-[50%] flex flex-col justify-center items-center">
            {/* Added description text as a guide */}
            <p className="mb-4 text-center text-gray-600">
                To get started, please create a workspace.
            </p>
            <CreateWorkspaceDialog />
        </div>
    );
};

export default CreateWorkspace;
