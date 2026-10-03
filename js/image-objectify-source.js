export function selectedObjectifyImage(current) {
  if (current.selectedIds?.length !== 1) return null;
  const image = current.objects.find(object => object.id === current.selectedIds[0]);
  return image?.type === 'image' && image.src ? structuredClone(image) : null;
}

export async function objectifyImageFile(image, { renderCutouts, fetchSource = fetch } = {}) {
  const source = image.cutouts?.length ? await renderCutouts(image) : image.src;
  const response = await fetchSource(source);
  if (!response.ok) throw new Error('선택한 이미지를 읽지 못했습니다.');
  const blob = await response.blob();
  if (!blob.size || !/^image\/(png|jpeg|webp)$/.test(blob.type)) {
    throw new Error('PNG, JPG 또는 WEBP 이미지를 선택해 주세요.');
  }
  const extension = blob.type === 'image/jpeg' ? 'jpg' : blob.type.split('/')[1];
  const name = String(image.name || image.sourceName || '선택한 이미지').replace(/\.(png|jpe?g|webp)$/i, '');
  return new File([blob], `${name}.${extension}`, { type: blob.type });
}
