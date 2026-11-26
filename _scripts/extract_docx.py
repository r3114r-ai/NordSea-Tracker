"""Extract paragraphs and tables from a .docx in document order."""
import sys
import zipfile

sys.stdout.reconfigure(encoding='utf-8', errors='replace')
from xml.etree import ElementTree as ET

W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'


def qn(t):
    return '{%s}%s' % (W, t)


def para_text(p):
    return ''.join(t.text or '' for t in p.iter(qn('t')))


def para_style(p):
    ppr = p.find(qn('pPr'))
    if ppr is not None:
        st = ppr.find(qn('pStyle'))
        if st is not None:
            return st.get(qn('val'))
    return None


def main(path):
    z = zipfile.ZipFile(path)
    root = ET.fromstring(z.read('word/document.xml'))
    body = root.find(qn('body'))
    idx = 0
    for child in body:
        tag = child.tag.replace('{%s}' % W, '')
        if tag == 'p':
            idx += 1
            txt = para_text(child).strip()
            style = para_style(child)
            print('[p:%d] (%s) %s' % (idx, style or '-', txt if txt else '<empty>'))
        elif tag == 'tbl':
            idx += 1
            print('[table:%d]' % idx)
            for row in child.findall(qn('tr')):
                cells = []
                for cell in row.findall(qn('tc')):
                    cells.append(' '.join(
                        para_text(p).strip() for p in cell.iter(qn('p'))).strip())
                print('  | ' + ' | '.join(cells))


if __name__ == '__main__':
    main(sys.argv[1])
