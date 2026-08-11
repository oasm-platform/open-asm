import { TargetSourceDto, toTargetSourceDto } from './target-source.dto';

describe('toTargetSourceDto', () => {
  it('maps MANUAL to the Manual label with no icon', () => {
    expect(toTargetSourceDto('MANUAL')).toEqual({
      source: 'Manual',
      icon: '',
    });
  });

  it('maps an integration schema $id to the schema title and icon', () => {
    expect(toTargetSourceDto('cloudflare')).toEqual({
      source: 'Cloudflare',
      icon: '/static/images/integrations/cloudflare.svg',
    });
  });

  it('maps INTERNAL_NETWORK to the Internal Network label with no icon', () => {
    expect(toTargetSourceDto('INTERNAL_NETWORK')).toEqual({
      source: 'Internal Network',
      icon: '',
    });
  });

  it('passes through an unknown raw source as the label with no icon, without throwing', () => {
    expect(toTargetSourceDto('LEGACY')).toEqual({
      source: 'LEGACY',
      icon: '',
    });
  });

  it('returns an empty-labeled DTO for an empty raw source', () => {
    expect(toTargetSourceDto('')).toEqual({ source: '', icon: '' });
  });
});

describe('TargetSourceDto', () => {
  it('is a class exposing source and icon string fields', () => {
    const dto = new TargetSourceDto();
    dto.source = 'Manual';
    dto.icon = '';
    expect(dto.source).toBe('Manual');
    expect(dto.icon).toBe('');
  });
});
