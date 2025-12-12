import { Button } from '@/components/ui/button';
import { axiosInstance } from '@/services/apis/axios-client';
import { getGlobalWorkspaceId } from '@/utils/workspaceState';
import axios from 'axios';
import { Download } from 'lucide-react';
import { toast } from 'sonner';

interface ExportDataButtonProps {
  api: string;
  prefix: string;
}
export default function ExportDataButton({
  api,
  prefix,
}: ExportDataButtonProps) {
  const handleDownload = async () => {
    try {
      // Show loading state
      const toastId = toast.loading('Exporting data...');

      // Create a fresh axios instance without any interceptors for blob downloads
      const downloadAxios = axios.create({
        baseURL: axiosInstance.defaults.baseURL,
        withCredentials: true,
      });

      // Get the workspace ID for the request using the proper function
      const workspaceId = getGlobalWorkspaceId() || '';

      // Get file with proper response type and headers
      const res = await downloadAxios.get(api, {
        responseType: 'blob',
        headers: {
          Accept: 'text/csv,application/vnd.ms-excel,text/plain',
          'X-Workspace-Id': workspaceId, // Add workspace ID header
        },
      });

      // Check if response is successful and contains data
      if (res.status === 200 && res.data) {
        // The response data should already be a blob due to responseType: 'blob'
        const blob = res.data;

        // Verify blob size before attempting download
        if (blob.size === 0) {
          throw new Error('Export returned empty file');
        }

        // Create object URL
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `${prefix || 'file'}_${Date.now()}.csv`); // Use timestamp for unique filename

        // For cross-browser compatibility
        link.style.display = 'none';
        document.body.appendChild(link);

        // Trigger the download
        link.click();

        // Clean up
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);

        // Success feedback
        toast.success('Export completed successfully!', { id: toastId });
      } else {
        throw new Error(`Export failed: ${res.status}`);
      }
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Export failed', {
        description:
          error instanceof Error ? error.message : 'Please try again',
      });
    }
  };

  return (
    <Button size={'sm'} variant="secondary" onClick={handleDownload}>
      <Download className="h-4 w-4 mr-2" />
      Export
    </Button>
  );
}
