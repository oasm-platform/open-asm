import CreateWorkspacePage from './create-workspace-page';

const CreateWorkspace = () => {
  return (
    <div className="h-[50vh] w-full flex flex-col justify-center items-center">
      {/* Added description text as a guide */}
      <p className="mb-4 text-center text-gray-600">
        To get started, please create a workspace.
      </p>
      <CreateWorkspacePage />
    </div>
  );
};

export default CreateWorkspace;
