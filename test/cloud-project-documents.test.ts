import { describe, expect, it } from 'vitest'
import { CloudProjectDocumentRegistry } from '../site/app/utils/cloudProjectDocuments'

describe('cloud project document registry', () => {
  it('resolves one open document per cloud file', () => {
    const registry = new CloudProjectDocumentRegistry()

    registry.bind('cloud-1', 'document-1')

    expect(registry.resolve('cloud-1', ['document-1'])).toBe('document-1')
    expect(registry.resolve('cloud-1', ['document-1', 'document-2'])).toBe('document-1')
  })

  it('allows a cloud file to be rebound after its document closes', () => {
    const registry = new CloudProjectDocumentRegistry()

    registry.bind('cloud-1', 'document-1')
    registry.unbindDocument('document-1')

    expect(registry.resolve('cloud-1', [])).toBeUndefined()

    registry.bind('cloud-1', 'document-2')
    expect(registry.resolve('cloud-1', ['document-2'])).toBe('document-2')
  })

  it('drops stale bindings and prevents concurrent duplicate loads', () => {
    const registry = new CloudProjectDocumentRegistry()

    registry.bind('cloud-1', 'closed-document')
    expect(registry.resolve('cloud-1', ['another-document'])).toBeUndefined()

    expect(registry.beginLoading('cloud-1')).toBe(true)
    expect(registry.beginLoading('cloud-1')).toBe(false)

    registry.finishLoading('cloud-1')
    expect(registry.beginLoading('cloud-1')).toBe(true)

    registry.removeFile('cloud-1')
    expect(registry.beginLoading('cloud-1')).toBe(true)
  })
})
