import { Controller, Post, Body, Get, UseGuards, Request, Headers } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto, RegisterDto } from './dto/auth.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import * as acceptLanguageParser from 'accept-language-parser';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  private getLanguageFromHeader(acceptLanguage: string | undefined): string {
    if (!acceptLanguage) return 'en';

    const languages = acceptLanguageParser.parse(acceptLanguage);
    if (languages.length === 0) return 'en';

    // Map language codes to our supported locales
    const code = languages[0].code;
    if (code === 'zh') {
      // Check for region to distinguish between Traditional and Simplified
      const region = languages[0].region;
      if (region === 'TW' || region === 'HK') return 'zh-TW';
      if (region === 'CN') return 'zh-CN';
      return 'zh-CN'; // Default to Simplified Chinese
    }

    return 'en'; // Default to English
  }

  @Post('login')
  async login(@Body() loginDto: LoginDto, @Headers('accept-language') acceptLanguage?: string) {
    const lang = this.getLanguageFromHeader(acceptLanguage);
    return this.authService.login(loginDto.email, loginDto.password, lang);
  }

  @Post('register')
  async register(@Body() registerDto: RegisterDto) {
    const user = await this.authService.register(registerDto.email, registerDto.password);
    return {
      message: 'User registered successfully',
      user,
    };
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async getProfile(@Request() req) {
    return this.authService.getUserById(req.user.userId);
  }
}
