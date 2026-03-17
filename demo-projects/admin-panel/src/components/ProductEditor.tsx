import React, { useState, FormEvent } from 'react';
import { ProductFormData, ProductVariant, ProductImage } from '@/types';
import { apiClient } from '@/services/api-client';

const EMPTY_VARIANT: ProductVariant = {
  name: '',
  sku: '',
  price: 0,
  inventory: 0,
  options: {},
};

interface ProductEditorProps {
  initialData?: ProductFormData;
  productId?: string;
  onSave: (data: ProductFormData) => void;
}

/** Full product create/edit form with variants, images, and SEO fields */
export function ProductEditor({ initialData, productId, onSave }: ProductEditorProps) {
  const [form, setForm] = useState<ProductFormData>(
    initialData ?? {
      title: '',
      description: '',
      price: 0,
      sku: '',
      images: [],
      variants: [],
      seoTitle: '',
      seoDescription: '',
      tags: [],
      isPublished: false,
      categoryId: '',
    },
  );
  const [saving, setSaving] = useState(false);
  const [tagInput, setTagInput] = useState('');

  const updateField = <K extends keyof ProductFormData>(key: K, value: ProductFormData[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const addVariant = () => {
    updateField('variants', [...form.variants, { ...EMPTY_VARIANT }]);
  };

  const updateVariant = (index: number, patch: Partial<ProductVariant>) => {
    const updated = form.variants.map((v, i) => (i === index ? { ...v, ...patch } : v));
    updateField('variants', updated);
  };

  const removeVariant = (index: number) => {
    updateField('variants', form.variants.filter((_, i) => i !== index));
  };

  const addTag = () => {
    const tag = tagInput.trim().toLowerCase();
    if (tag && !form.tags.includes(tag)) {
      updateField('tags', [...form.tags, tag]);
      setTagInput('');
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (productId) {
        await apiClient.put(`/products/${productId}`, form);
      } else {
        await apiClient.post('/products', form);
      }
      onSave(form);
    } catch (err) {
      console.error('Failed to save product:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="product-editor" onSubmit={handleSubmit}>
      <h2>{productId ? 'Edit Product' : 'New Product'}</h2>
      <fieldset className="product-editor__basic">
        <legend>Basic Information</legend>
        <label>Title<input type="text" value={form.title} onChange={(e) => updateField('title', e.target.value)} required /></label>
        <label>Description<textarea value={form.description} onChange={(e) => updateField('description', e.target.value)} rows={4} /></label>
        <label>Price<input type="number" step="0.01" min="0" value={form.price} onChange={(e) => updateField('price', parseFloat(e.target.value))} required /></label>
        <label>Compare-at Price<input type="number" step="0.01" min="0" value={form.compareAtPrice ?? ''} onChange={(e) => updateField('compareAtPrice', parseFloat(e.target.value) || undefined)} /></label>
        <label>SKU<input type="text" value={form.sku} onChange={(e) => updateField('sku', e.target.value)} required /></label>
        <label className="product-editor__toggle">
          <input type="checkbox" checked={form.isPublished} onChange={(e) => updateField('isPublished', e.target.checked)} /> Published
        </label>
      </fieldset>
      <fieldset className="product-editor__variants">
        <legend>Variants ({form.variants.length})</legend>
        {form.variants.map((v, i) => (
          <div key={i} className="variant-row">
            <input placeholder="Name" value={v.name} onChange={(e) => updateVariant(i, { name: e.target.value })} />
            <input placeholder="SKU" value={v.sku} onChange={(e) => updateVariant(i, { sku: e.target.value })} />
            <input type="number" placeholder="Price" value={v.price} onChange={(e) => updateVariant(i, { price: parseFloat(e.target.value) })} />
            <input type="number" placeholder="Inventory" value={v.inventory} onChange={(e) => updateVariant(i, { inventory: parseInt(e.target.value, 10) })} />
            <button type="button" onClick={() => removeVariant(i)}>Remove</button>
          </div>
        ))}
        <button type="button" onClick={addVariant}>+ Add Variant</button>
      </fieldset>
      <fieldset className="product-editor__seo">
        <legend>SEO</legend>
        <label>SEO Title<input type="text" maxLength={60} value={form.seoTitle ?? ''} onChange={(e) => updateField('seoTitle', e.target.value)} /></label>
        <label>SEO Description<textarea maxLength={160} value={form.seoDescription ?? ''} onChange={(e) => updateField('seoDescription', e.target.value)} /></label>
      </fieldset>
      <fieldset className="product-editor__tags">
        <legend>Tags</legend>
        <div className="tag-input">
          <input value={tagInput} onChange={(e) => setTagInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())} placeholder="Add tag..." />
          <button type="button" onClick={addTag}>Add</button>
        </div>
        <div className="tag-list">{form.tags.map((t) => <span key={t} className="tag">{t}</span>)}</div>
      </fieldset>
      <button type="submit" className="product-editor__submit" disabled={saving}>
        {saving ? 'Saving...' : productId ? 'Update Product' : 'Create Product'}
      </button>
    </form>
  );
}
