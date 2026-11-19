import { Module } from '@nestjs/common';
import { I18nDictionaryController } from './i18n-dictionary.controller';

@Module({
  controllers: [I18nDictionaryController],
})
export class I18nDictionaryModule {}
