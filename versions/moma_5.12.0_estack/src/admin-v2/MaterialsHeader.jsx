import { BookOpen } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Heading } from './ModelOperationsUI';
import { sections } from './navigation.mjs';

const materialPages = sections.flatMap(group => group.items).find(item => item.id === 'materials').children;

export default function MaterialsHeader({ active, ops, children }) {
  return <div className="mo-materials-header mo-catalog-workbench">
    <Heading title={<><BookOpen/>资料管理</>} description="统一维护模型资料、计费项、计价单位和货币。">{children}</Heading>
    <Tabs value={active} onValueChange={id => ops.proceed(() => { location.hash = '#/admin-2/' + id; })}>
      <TabsList variant="line" className="mo-detail-tabs mo-materials-tabs" aria-label="资料分类">
        {materialPages.map(([id, label]) => <TabsTrigger key={id} value={id}>{label}</TabsTrigger>)}
      </TabsList>
    </Tabs>
  </div>;
}
