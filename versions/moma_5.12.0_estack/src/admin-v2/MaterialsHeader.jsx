import DevelopmentNotes from './DevelopmentNotes';
import { BookOpen } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Heading } from './ModelOperationsUI';
import { TARIFF_KINDS } from './tariff-dictionary';

const materialPages = [['model-templates', '模型资料库'], ...Object.entries(TARIFF_KINDS)];

export default function MaterialsHeader({ active, ops, children }) {
  return <div className="mo-materials-header mo-catalog-workbench">
    <Heading title={<><BookOpen/>资料管理<DevelopmentNotes area="资料管理"/></>}>{children}</Heading>
    <Tabs value={active} onValueChange={id => ops.proceed(() => { location.hash = id === 'model-templates' ? '#/admin-2/model-templates' : '#/admin-2/tariff-dictionary?tab=' + id; })}>
      <TabsList variant="line" className="mo-detail-tabs mo-materials-tabs" aria-label="资料分类">
        {materialPages.map(([id, label]) => <TabsTrigger key={id} value={id}>{label}</TabsTrigger>)}
      </TabsList>
    </Tabs>
  </div>;
}
