import * as deepl from 'deepl-node';
import { DEEPL_LANGUAGE_MAP } from '../types/index';

/**
 * Translation service using DeepL API
 */
export class TranslationService {
  private translator: deepl.Translator;

  constructor(apiKey?: string) {
    if (!apiKey) {
      throw new Error('DEEPL_API_KEY environment variable is required');
    }
    this.translator = new deepl.Translator(apiKey);
  }

  /**
   * Translate text to target language
   */
  async translateText(text: string, targetLanguage: string): Promise<string> {
    const deeplTargetLang = DEEPL_LANGUAGE_MAP[targetLanguage];
    if (!deeplTargetLang) {
      throw new Error(`Unsupported target language: ${targetLanguage}`);
    }

    try {
      const result = await this.translator.translateText(
        text,
        'ja',
        deeplTargetLang as deepl.TargetLanguageCode
      );

      return Array.isArray(result) ? result[0].text : (result as any).text;
    } catch (error) {
      throw new Error(
        `DeepL translation failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Translate multiple texts in batch
   */
  async translateBatch(texts: string[], targetLanguage: string): Promise<string[]> {
    const deeplTargetLang = DEEPL_LANGUAGE_MAP[targetLanguage];
    if (!deeplTargetLang) {
      throw new Error(`Unsupported target language: ${targetLanguage}`);
    }

    try {
      const results = await this.translator.translateText(
        texts,
        'ja',
        deeplTargetLang as deepl.TargetLanguageCode
      );

      return Array.isArray(results) ? results.map(r => r.text) : [(results as any).text];
    } catch (error) {
      throw new Error(
        `DeepL batch translation failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Get usage information
   */
  async getUsage(): Promise<deepl.Usage> {
    try {
      return await this.translator.getUsage();
    } catch (error) {
      throw new Error(
        `Failed to get DeepL usage: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Check if character limit would be exceeded
   */
  async checkCharacterLimit(textLength: number): Promise<boolean> {
    try {
      const usage = await this.getUsage();
      const remaining = (usage.character?.limit || 0) - (usage.character?.count || 0);
      return textLength <= remaining;
    } catch (error) {
      // If we can't check usage, assume it's OK and let DeepL handle the limit
      return true;
    }
  }
}
