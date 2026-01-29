import { BadRequestException } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { SystemConfigsService } from '../system-configs/system-configs.service';
import { StorageController } from './storage.controller';
import { StorageService } from './storage.service';

describe('StorageController', () => {
  let controller: StorageController;
  let mockStorageService: Partial<StorageService>;
  let mockSystemConfigsService: Partial<SystemConfigsService>;

  const mockFile: Express.Multer.File = {
    fieldname: 'file',
    originalname: 'logo.png',
    encoding: '7bit',
    mimetype: 'image/png',
    buffer: Buffer.from('test image data'),
    size: 1024,
    filename: 'logo.png',
    destination: '/tmp',
    path: '/tmp/logo.png',
    stream: null as any,
  };

  beforeEach(async () => {
    mockStorageService = {
      uploadFile: jest.fn(),
    };

    mockSystemConfigsService = {
      updateConfig: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [StorageController],
      providers: [
        {
          provide: StorageService,
          useValue: mockStorageService,
        },
        {
          provide: SystemConfigsService,
          useValue: mockSystemConfigsService,
        },
      ],
    }).compile();

    controller = module.get<StorageController>(StorageController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('uploadLogo', () => {
    it('should upload logo successfully with PNG file', async () => {
      const mockUploadResult = { path: 'system/logo.png' };
      (mockStorageService.uploadFile as jest.Mock).mockReturnValue(
        mockUploadResult,
      );
      (mockSystemConfigsService.updateConfig as jest.Mock).mockResolvedValue({
        message: 'System configuration updated successfully',
      });

      const result = await controller.uploadLogo(mockFile);

      expect(mockStorageService.uploadFile).toHaveBeenCalledWith(
        'logo.png',
        mockFile.buffer,
        'system',
      );
      expect(mockSystemConfigsService.updateConfig).toHaveBeenCalledWith({
        logoPath: 'system/logo.png',
      });
      expect(result).toEqual({ message: 'Logo uploaded successfully' });
    });

    it('should upload logo successfully with JPEG file', async () => {
      const jpegFile = {
        ...mockFile,
        originalname: 'logo.jpg',
        mimetype: 'image/jpeg',
      };
      const mockUploadResult = { path: 'system/logo.jpg' };
      (mockStorageService.uploadFile as jest.Mock).mockReturnValue(
        mockUploadResult,
      );
      (mockSystemConfigsService.updateConfig as jest.Mock).mockResolvedValue({
        message: 'System configuration updated successfully',
      });

      const result = await controller.uploadLogo(jpegFile);

      expect(mockStorageService.uploadFile).toHaveBeenCalledWith(
        'logo.jpg',
        jpegFile.buffer,
        'system',
      );
      expect(mockSystemConfigsService.updateConfig).toHaveBeenCalledWith({
        logoPath: 'system/logo.jpg',
      });
      expect(result).toEqual({ message: 'Logo uploaded successfully' });
    });

    it('should upload logo successfully with SVG file', async () => {
      const svgFile = {
        ...mockFile,
        originalname: 'logo.svg',
        mimetype: 'image/svg+xml',
      };
      const mockUploadResult = { path: 'system/logo.svg' };
      (mockStorageService.uploadFile as jest.Mock).mockReturnValue(
        mockUploadResult,
      );
      (mockSystemConfigsService.updateConfig as jest.Mock).mockResolvedValue({
        message: 'System configuration updated successfully',
      });

      const result = await controller.uploadLogo(svgFile);

      expect(mockStorageService.uploadFile).toHaveBeenCalledWith(
        'logo.svg',
        svgFile.buffer,
        'system',
      );
      expect(mockSystemConfigsService.updateConfig).toHaveBeenCalledWith({
        logoPath: 'system/logo.svg',
      });
      expect(result).toEqual({ message: 'Logo uploaded successfully' });
    });

    it('should throw BadRequestException for file without extension', async () => {
      const invalidFile = {
        ...mockFile,
        originalname: 'logo',
      };

      await expect(controller.uploadLogo(invalidFile)).rejects.toThrow(
        BadRequestException,
      );
      await expect(controller.uploadLogo(invalidFile)).rejects.toThrow(
        'Invalid file extension',
      );
      expect(mockStorageService.uploadFile).not.toHaveBeenCalled();
      expect(mockSystemConfigsService.updateConfig).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException for non-image file (PDF)', async () => {
      const pdfFile = {
        ...mockFile,
        originalname: 'document.pdf',
        mimetype: 'application/pdf',
      };

      await expect(controller.uploadLogo(pdfFile)).rejects.toThrow(
        BadRequestException,
      );
      await expect(controller.uploadLogo(pdfFile)).rejects.toThrow(
        'File type .pdf is not allowed. Only image files are supported.',
      );
      expect(mockStorageService.uploadFile).not.toHaveBeenCalled();
      expect(mockSystemConfigsService.updateConfig).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException for non-image file (EXE)', async () => {
      const exeFile = {
        ...mockFile,
        originalname: 'program.exe',
        mimetype: 'application/x-msdownload',
      };

      await expect(controller.uploadLogo(exeFile)).rejects.toThrow(
        BadRequestException,
      );
      await expect(controller.uploadLogo(exeFile)).rejects.toThrow(
        'File type .exe is not allowed. Only image files are supported.',
      );
      expect(mockStorageService.uploadFile).not.toHaveBeenCalled();
      expect(mockSystemConfigsService.updateConfig).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException for non-image file (TXT)', async () => {
      const txtFile = {
        ...mockFile,
        originalname: 'readme.txt',
        mimetype: 'text/plain',
      };

      await expect(controller.uploadLogo(txtFile)).rejects.toThrow(
        BadRequestException,
      );
      await expect(controller.uploadLogo(txtFile)).rejects.toThrow(
        'File type .txt is not allowed. Only image files are supported.',
      );
      expect(mockStorageService.uploadFile).not.toHaveBeenCalled();
      expect(mockSystemConfigsService.updateConfig).not.toHaveBeenCalled();
    });

    it('should handle uppercase file extension', async () => {
      const uppercaseFile = {
        ...mockFile,
        originalname: 'logo.PNG',
      };
      const mockUploadResult = { path: 'system/logo.png' };
      (mockStorageService.uploadFile as jest.Mock).mockReturnValue(
        mockUploadResult,
      );
      (mockSystemConfigsService.updateConfig as jest.Mock).mockResolvedValue({
        message: 'System configuration updated successfully',
      });

      const result = await controller.uploadLogo(uppercaseFile);

      expect(mockStorageService.uploadFile).toHaveBeenCalledWith(
        'logo.png',
        uppercaseFile.buffer,
        'system',
      );
      expect(result).toEqual({ message: 'Logo uploaded successfully' });
    });

    it('should handle mixed case file extension', async () => {
      const mixedCaseFile = {
        ...mockFile,
        originalname: 'logo.PnG',
      };
      const mockUploadResult = { path: 'system/logo.png' };
      (mockStorageService.uploadFile as jest.Mock).mockReturnValue(
        mockUploadResult,
      );
      (mockSystemConfigsService.updateConfig as jest.Mock).mockResolvedValue({
        message: 'System configuration updated successfully',
      });

      const result = await controller.uploadLogo(mixedCaseFile);

      expect(mockStorageService.uploadFile).toHaveBeenCalledWith(
        'logo.png',
        mixedCaseFile.buffer,
        'system',
      );
      expect(result).toEqual({ message: 'Logo uploaded successfully' });
    });

    it('should upload logo successfully with WEBP file', async () => {
      const webpFile = {
        ...mockFile,
        originalname: 'logo.webp',
        mimetype: 'image/webp',
      };
      const mockUploadResult = { path: 'system/logo.webp' };
      (mockStorageService.uploadFile as jest.Mock).mockReturnValue(
        mockUploadResult,
      );
      (mockSystemConfigsService.updateConfig as jest.Mock).mockResolvedValue({
        message: 'System configuration updated successfully',
      });

      const result = await controller.uploadLogo(webpFile);

      expect(mockStorageService.uploadFile).toHaveBeenCalledWith(
        'logo.webp',
        webpFile.buffer,
        'system',
      );
      expect(mockSystemConfigsService.updateConfig).toHaveBeenCalledWith({
        logoPath: 'system/logo.webp',
      });
      expect(result).toEqual({ message: 'Logo uploaded successfully' });
    });

    it('should upload logo successfully with GIF file', async () => {
      const gifFile = {
        ...mockFile,
        originalname: 'logo.gif',
        mimetype: 'image/gif',
      };
      const mockUploadResult = { path: 'system/logo.gif' };
      (mockStorageService.uploadFile as jest.Mock).mockReturnValue(
        mockUploadResult,
      );
      (mockSystemConfigsService.updateConfig as jest.Mock).mockResolvedValue({
        message: 'System configuration updated successfully',
      });

      const result = await controller.uploadLogo(gifFile);

      expect(mockStorageService.uploadFile).toHaveBeenCalledWith(
        'logo.gif',
        gifFile.buffer,
        'system',
      );
      expect(mockSystemConfigsService.updateConfig).toHaveBeenCalledWith({
        logoPath: 'system/logo.gif',
      });
      expect(result).toEqual({ message: 'Logo uploaded successfully' });
    });
  });
});
