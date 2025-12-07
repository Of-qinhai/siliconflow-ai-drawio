import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * 自动适配画布大小
 * 分析图表中所有元素的几何信息，计算合适的画布大小
 * 并更新 mxGraphModel 的属性
 */
export function autoFitCanvas(xml: string): string {
  if (!xml || xml.trim() === '') {
    return xml;
  }

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, "text/xml");
    
    // 检查解析错误
    const parseError = doc.querySelector("parsererror");
    if (parseError) {
      console.warn("XML 解析错误，返回原始 XML");
      return xml;
    }

    // 查找所有带有几何信息的元素
    const mxGeometries = doc.querySelectorAll("mxGeometry");
    
    if (mxGeometries.length === 0) {
      return xml;
    }

    // 计算边界框
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    mxGeometries.forEach((geo) => {
      const x = parseFloat(geo.getAttribute("x") || "0");
      const y = parseFloat(geo.getAttribute("y") || "0");
      const width = parseFloat(geo.getAttribute("width") || "0");
      const height = parseFloat(geo.getAttribute("height") || "0");

      // 只处理有效的几何信息
      if (!isNaN(x) && !isNaN(y)) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x + width);
        maxY = Math.max(maxY, y + height);
      }
    });

    // 如果没有有效的几何信息，返回原始 XML
    if (minX === Infinity || maxX === -Infinity) {
      return xml;
    }

    // 计算内容尺寸，添加边距
    const padding = 100; // 边距
    const contentWidth = maxX - minX + padding * 2;
    const contentHeight = maxY - minY + padding * 2;

    // 设置画布大小，确保最小尺寸
    const pageWidth = Math.max(contentWidth, 1200);
    const pageHeight = Math.max(contentHeight, 800);

    // 计算偏移，使内容居中
    const dx = Math.max(padding - minX, (pageWidth - contentWidth) / 2 + padding - minX);
    const dy = Math.max(padding - minY, (pageHeight - contentHeight) / 2 + padding - minY);

    // 查找 mxGraphModel 元素
    const mxGraphModel = doc.querySelector("mxGraphModel");
    if (mxGraphModel) {
      // 设置画布属性
      mxGraphModel.setAttribute("dx", Math.round(dx).toString());
      mxGraphModel.setAttribute("dy", Math.round(dy).toString());
      mxGraphModel.setAttribute("pageWidth", Math.round(pageWidth).toString());
      mxGraphModel.setAttribute("pageHeight", Math.round(pageHeight).toString());
      mxGraphModel.setAttribute("pageScale", "1");
      mxGraphModel.setAttribute("page", "1");
      mxGraphModel.setAttribute("grid", "1");
      mxGraphModel.setAttribute("gridSize", "10");
      mxGraphModel.setAttribute("guides", "1");
      mxGraphModel.setAttribute("tooltips", "1");
      mxGraphModel.setAttribute("connect", "1");
      mxGraphModel.setAttribute("arrows", "1");
      mxGraphModel.setAttribute("fold", "1");
    }

    const serializer = new XMLSerializer();
    return serializer.serializeToString(doc);
  } catch (error) {
    console.error("自动适配画布大小时出错:", error);
    return xml;
  }
}

/**
 * 将不完整的 XML 字符串转换为合法的 XML
 * 智能提取完整的标签，保留 mxCell 和其他重要元素
 * 增强版：更好地处理嵌套和不完整的 XML，并转义特殊字符
 */
export function convertToLegalXml(xmlString: string): string {
  if (!xmlString || xmlString.trim() === '') {
    return '<root>\n  <mxCell id="0"/>\n  <mxCell id="1" parent="0"/>\n</root>';
  }

  try {
    // 预处理：转义属性值中的特殊字符
    // 匹配所有属性值（在引号内的内容）
    let cleanedXml = xmlString.replace(/(\w+)="([^"]*)"/g, (match, attrName, attrValue) => {
      // 转义属性值中的特殊字符
      const escapedValue = attrValue
        .replace(/&(?!amp;|lt;|gt;|quot;|apos;)/g, '&amp;')  // & -> &amp; (避免重复转义)
        .replace(/</g, '&lt;')   // < -> &lt;
        .replace(/>/g, '&gt;')   // > -> &gt;
        .replace(/"/g, '&quot;') // " -> &quot;
        .replace(/'/g, '&apos;'); // ' -> &apos;

      return `${attrName}="${escapedValue}"`;
    });

    // 如果已经包含完整的 <root> 标签，尝试验证并返回
    if (cleanedXml.includes('<root>') && cleanedXml.includes('</root>')) {
      const rootMatch = cleanedXml.match(/<root>([\s\S]*?)<\/root>/);
      if (rootMatch) {
        // 验证是否可解析
        try {
          const parser = new DOMParser();
          const doc = parser.parseFromString(`<root>${rootMatch[1]}</root>`, "text/xml");
          const parseError = doc.querySelector("parsererror");
          if (!parseError) {
            return `<root>${rootMatch[1]}</root>`;
          }
        } catch {
          // 继续后续处理
        }
      }
    }

    // 匹配完整的 mxCell 标签（自闭合或包含子元素）
    const mxCellRegex = /<mxCell\b[^>]*(?:\/>|>[\s\S]*?<\/mxCell>)/g;
    const cells: string[] = [];
    let match: RegExpExecArray | null;

    while ((match = mxCellRegex.exec(cleanedXml)) !== null) {
      cells.push(match[0]);
    }

    if (cells.length === 0) {
      // 没有找到完整的 mxCell，返回空图表
      return '<root>\n  <mxCell id="0"/>\n  <mxCell id="1" parent="0"/>\n</root>';
    }

    // 检查是否包含基础节点
    const hasCell0 = cells.some(cell => cell.includes('id="0"'));
    const hasCell1 = cells.some(cell => cell.includes('id="1"'));

    let result = "<root>\n";

    // 添加缺失的基础节点
    if (!hasCell0) {
      result += '  <mxCell id="0"/>\n';
    }
    if (!hasCell1) {
      result += '  <mxCell id="1" parent="0"/>\n';
    }

    // 添加所有提取的完整 cell
    for (const cell of cells) {
      const formatted = cell.split('\n').map(line => "  " + line.trim()).join('\n');
      result += formatted + "\n";
    }

    result += "</root>";

    return result;
  } catch (error) {
    console.error("convertToLegalXml error:", error);
    return '<root>\n  <mxCell id="0"/>\n  <mxCell id="1" parent="0"/>\n</root>';
  }
}

/**
 * 替换 Draw.io XML 中的节点
 * 与 next-ai-draw-io 保持一致
 */
export function replaceNodes(currentXML: string, nodes: string): string {
  if (!currentXML || !nodes) {
    throw new Error("Both currentXML and nodes must be provided");
  }

  try {
    const parser = new DOMParser();
    const currentDoc = parser.parseFromString(currentXML, "text/xml");

    let nodesString = nodes;
    if (!nodes.includes("<root>")) {
      nodesString = `<root>${nodes}</root>`;
    }

    const nodesDoc = parser.parseFromString(nodesString, "text/xml");

    // 查找 mxGraphModel > root
    let currentRoot = currentDoc.querySelector("mxGraphModel > root");
    if (!currentRoot) {
      const mxGraphModel = currentDoc.querySelector("mxGraphModel") ||
        currentDoc.createElement("mxGraphModel");

      if (!currentDoc.contains(mxGraphModel)) {
        currentDoc.appendChild(mxGraphModel);
      }

      currentRoot = currentDoc.createElement("root");
      mxGraphModel.appendChild(currentRoot);
    }

    const nodesRoot = nodesDoc.querySelector("root");
    if (!nodesRoot) {
      throw new Error("Invalid nodes: Could not find <root> element");
    }

    // 清空当前节点
    while (currentRoot.firstChild) {
      currentRoot.removeChild(currentRoot.firstChild);
    }

    // 检查必要的基础节点
    const hasCell0 = Array.from(nodesRoot.childNodes).some(
      node => node.nodeName === "mxCell" &&
        (node as Element).getAttribute("id") === "0"
    );

    const hasCell1 = Array.from(nodesRoot.childNodes).some(
      node => node.nodeName === "mxCell" &&
        (node as Element).getAttribute("id") === "1"
    );

    // 复制所有子节点
    Array.from(nodesRoot.childNodes).forEach(node => {
      const importedNode = currentDoc.importNode(node, true);
      currentRoot.appendChild(importedNode);
    });

    // 添加缺失的基础节点
    if (!hasCell0) {
      const cell0 = currentDoc.createElement("mxCell");
      cell0.setAttribute("id", "0");
      currentRoot.insertBefore(cell0, currentRoot.firstChild);
    }

    if (!hasCell1) {
      const cell1 = currentDoc.createElement("mxCell");
      cell1.setAttribute("id", "1");
      cell1.setAttribute("parent", "0");
      const cell0 = currentRoot.querySelector('mxCell[id="0"]');
      if (cell0 && cell0.nextSibling) {
        currentRoot.insertBefore(cell1, cell0.nextSibling);
      } else {
        currentRoot.appendChild(cell1);
      }
    }

    const serializer = new XMLSerializer();
    return serializer.serializeToString(currentDoc);
  } catch (error) {
    throw new Error(`Error replacing nodes: ${error}`);
  }
}
