import type { GlossProviderInput, GlossProviderOutput } from '../types';

export interface ISLGlossProvider {
  readonly id: string;
  generate(input: GlossProviderInput): Promise<GlossProviderOutput>;
}

export class GlossProviderRegistry {
  private readonly providers = new Map<string, ISLGlossProvider>();

  register(provider: ISLGlossProvider): void {
    if (this.providers.has(provider.id)) {
      throw new Error(`ISL gloss provider "${provider.id}" is already registered.`);
    }
    this.providers.set(provider.id, provider);
  }

  resolve(id: string): ISLGlossProvider {
    const provider = this.providers.get(id);
    if (!provider) throw new Error(`ISL gloss provider "${id}" is not registered.`);
    return provider;
  }
}
