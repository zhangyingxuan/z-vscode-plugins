export const compactHeight = 30;
// 按六行表格和操作区预留高度，窄列换行时仍有余量。
export const detailsHeight = 164;

export function fitBounds(bounds, workArea) {
  // 工作区可能有负坐标，也可能因任务栏位置而不从屏幕边缘起算。
  const width = Math.min(bounds.width, workArea.width);
  const height = Math.min(bounds.height, workArea.height);
  return {
    x: Math.max(workArea.x, Math.min(bounds.x, workArea.x + workArea.width - width)),
    y: Math.max(workArea.y, Math.min(bounds.y, workArea.y + workArea.height - height)),
    width,
    height,
  };
}

export function getHoverLayout(bounds, workArea) {
  // 优先保留行情条位置，窗口两侧都放不下时再调整到工作区内。
  const below = workArea.y + workArea.height - bounds.y - compactHeight;
  const above = below < detailsHeight && bounds.y - workArea.y > below;
  const height = Math.min(compactHeight + detailsHeight, workArea.height);
  const y = above ? bounds.y + compactHeight - height : bounds.y;
  return { above, ...fitBounds({ ...bounds, y, height }, workArea) };
}

export function fitDragBounds(bounds, workArea, compact) {
  // 收起时原生窗口可能比可见行情条高，按可见区域贴齐任务栏。
  return fitBounds({ ...bounds, height: compact ? compactHeight : bounds.height }, workArea);
}
