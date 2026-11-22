import { Card, Tabs } from '@douyinfe/semi-ui';
import AdminPageHeading from './AdminPageHeading';
import Table from './AdminTable';

export default function GuideGlossary({ section, english }) {
  const [table] = section.blocks;
  const chineseColumns = table.headings.slice(0, 3).map((title, index) => ({
    title, key: title, render: (_, row) => row[index],
  }));
  const englishColumns = [
    { title: 'Field', key: 'field', render: (_, row) => row[1] },
    { title: 'Definition', key: 'definition', render: (_, row) => row[3] },
  ];
  return <article className="admin-page-stack" lang={english ? 'en' : 'zh-CN'}>
    <AdminPageHeading title={english ? 'Model Operations' : '模型运营'}/>
    <Card><Tabs type="line" defaultActiveKey="fields">
      <Tabs.TabPane itemKey="fields" tab={english ? 'Key Concepts and Fields' : section.title}>
        <Table columns={english ? englishColumns : chineseColumns} dataSource={table.rows} rowKey={row => row[0]} pagination={false}/>
      </Tabs.TabPane>
    </Tabs></Card>
  </article>;
}
