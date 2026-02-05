import { Controller, Post, Get, Delete, Param, Body, HttpCode, Res, Req } from '@nestjs/common';
import { Response, Request } from 'express';
import { PreviewService } from './preview.service';
import { createProxyMiddleware } from 'http-proxy-middleware';

@Controller('preview')
export class PreviewController {
  constructor(private previewService: PreviewService) {}

  @Post(':sessionId/start')
  @HttpCode(200)
  async startPreview(
    @Param('sessionId') sessionId: string,
    @Body('command') command?: string,
  ) {
    const result = await this.previewService.startPreview(sessionId, command);
    return {
      success: true,
      ...result,
      previewUrl: `/api/preview/${sessionId}/proxy`,
    };
  }

  @Delete(':sessionId/stop')
  @HttpCode(200)
  async stopPreview(@Param('sessionId') sessionId: string) {
    const result = await this.previewService.stopPreview(sessionId);
    return {
      success: true,
      ...result,
    };
  }

  @Get(':sessionId/status')
  async getPreviewStatus(@Param('sessionId') sessionId: string) {
    const status = this.previewService.getPreviewStatus(sessionId);

    if (!status) {
      return {
        running: false,
        message: 'No active preview for this session',
      };
    }

    return {
      running: true,
      ...status,
      previewUrl: `/api/preview/${sessionId}/proxy`,
    };
  }

  @Get(':sessionId/proxy*')
  async proxyRequest(
    @Param('sessionId') sessionId: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const status = this.previewService.getPreviewStatus(sessionId);

    if (!status || (status.status !== 'running' && status.status !== 'starting')) {
      return res.status(503).json({
        error: 'Preview server not running',
        message: 'The preview server is not running. Please start it first.',
      });
    }

    // Create proxy middleware dynamically
    const proxy = createProxyMiddleware({
      target: `http://localhost:${status.port}`,
      changeOrigin: true,
      ws: true, // Support WebSocket
      pathRewrite: (path) => {
        // Remove /api/preview/:sessionId/proxy from the path
        return path.replace(`/api/preview/${sessionId}/proxy`, '') || '/';
      },
      on: {
        error: (err, req, res) => {
          console.error(`Proxy error for session ${sessionId}:`, err.message);
          // Check if res is ServerResponse (not Socket)
          if (res && 'writeHead' in res && 'headersSent' in res) {
            if (!res.headersSent) {
              res.writeHead(502, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({
                error: 'Proxy error',
                message: 'Failed to connect to preview server',
              }));
            }
          }
        },
      },
    });

    // Apply proxy
    proxy(req, res);
  }
}
