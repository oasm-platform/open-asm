import { Public } from '@/common/decorators/app.decorator';
import { Doc } from '@/common/doc/doc.decorator';
import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { I18nService } from 'nestjs-i18n';

@ApiTags('I18n')
@Controller('i18n')
export class I18nDictionaryController {
  constructor(private readonly i18n: I18nService) {}

  @Public()
  @Doc({
    summary: 'List supported languages',
    description:
      'Language codes the backend has translations for. The console uses this to offer a language switcher.',
  })
  @Get('languages')
  getLanguages(): string[] {
    return this.i18n.getSupportedLanguages();
  }

  @Public()
  @Doc({
    summary: 'Get UI dictionary for a language',
    description:
      'Merged namespaces from backend memory (same source the API translates with). Missing languages fall back only when the service resolves them; unknown codes give 404.',
  })
  // No HTTP cache: the console keeps its own copy and refreshes it on boot,
  // a browser cache would hand that refresh a pre-deploy copy.
  @Get(':lang')
  getDictionary(@Param('lang') lang: string): {
    lang: string;
    dictionaries: Record<string, Record<string, string>>;
  } {
    if (!this.i18n.getSupportedLanguages().includes(lang)) {
      throw new NotFoundException(`Unsupported language: ${lang}`);
    }
    const all = this.i18n.getTranslations() as Record<
      string,
      Record<string, Record<string, string>>
    >;
    // `errors` is translated server-side (DomainExceptionFilter); the console never reads it
    const dictionaries = { ...all[lang] };
    delete dictionaries.errors;
    return { lang, dictionaries };
  }
}
