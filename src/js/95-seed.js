/* ===== Demo data generator (first-run / testing) ===== */
const Seed = {
  create(opts) {
    opts = opts || {};
    const prevSystemMode = Perms.systemMode;
    Perms.systemMode = true;
    try {
      const s = Store.state;
      if (s.users.length) throw new Error('seed only on empty state');

      /* departments */
      const dIt = Org.createDepartment({ name: 'فناوری اطلاعات' });
      const dHr = Org.createDepartment({ name: 'منابع انسانی' });
      const dMk = Org.createDepartment({ name: 'بازاریابی' });

      /* teams */
      const tDev = Org.createTeam({ name: 'تیم توسعه', departmentId: dIt.id });
      const tInfra = Org.createTeam({ name: 'تیم زیرساخت', departmentId: dIt.id });
      const tHr = Org.createTeam({ name: 'تیم جذب', departmentId: dHr.id });

      /* roles */
      const adminRole = s.roles.find(r => r.key === 'role_admin');
      const pmRole = s.roles.find(r => r.key === 'role_pm');
      const empRole = s.roles.find(r => r.key === 'role_emp');
      const leadRole = s.roles.find(r => r.key === 'role_lead');

      /* employees */
      const ceo = Employees.create({ fullName: 'سارا محمدی', empNo: '1001', jobTitle: 'مدیر فناوری', departmentId: dIt.id, teamId: tDev.id, email: 'sara@atlas.local', phone: '09120000001', status: 'active' });
      const dev1 = Employees.create({ fullName: 'علی رضایی', empNo: '1002', jobTitle: 'توسعه‌دهنده ارشد', departmentId: dIt.id, teamId: tDev.id, managerId: ceo.id, email: 'ali@atlas.local', status: 'active' });
      const dev2 = Employees.create({ fullName: 'مریم کریمی', empNo: '1003', jobTitle: 'توسعه‌دهنده', departmentId: dIt.id, teamId: tDev.id, managerId: ceo.id, status: 'active' });
      const ops1 = Employees.create({ fullName: 'حسین نوری', empNo: '1004', jobTitle: 'کارشناس زیرساخت', departmentId: dIt.id, teamId: tInfra.id, managerId: ceo.id, status: 'active' });
      const hr1 = Employees.create({ fullName: 'نگار احمدی', empNo: '2001', jobTitle: 'کارشناس جذب', departmentId: dHr.id, teamId: tHr.id, status: 'active' });
      const mk1 = Employees.create({ fullName: 'رضا شریفی', empNo: '3001', jobTitle: 'کارشناس بازاریابی', departmentId: dMk.id, status: 'active' });

      /* users */
      const uAdmin = Users.create({ username: 'admin', displayName: 'مدیر سیستم', password: opts.adminPassword || 'atlas1234', roles: [adminRole.id], employeeId: ceo.id });
      const uPm = Users.create({ username: 'pm.user', displayName: 'مدیر پروژه', password: 'atlas1234', roles: [pmRole.id], employeeId: dev1.id });
      const uLead = Users.create({ username: 'team.lead', displayName: 'سرگروه', password: 'atlas1234', roles: [leadRole.id], employeeId: ops1.id });
      const uEmp = Users.create({ username: 'employee', displayName: 'کارمند نمونه', password: 'atlas1234', roles: [empRole.id], employeeId: dev2.id });

      /* projects */
      const today = Cal.todayISO();
      const p1 = Projects.create({
        title: 'سامانه مدیریت منابع انسانی', description: 'پیاده‌سازی سامانه یکپارچه منابع انسانی',
        objectives: 'کاهش کار دستی و افزایش دقت فرایندها',
        managerEmployeeId: dev1.id, memberIds: [dev1.id, dev2.id, hr1.id],
        departmentId: dIt.id, teamId: tDev.id,
        startDate: Cal.addDays(today, -30), endDate: Cal.addDays(today, 60), targetDate: Cal.addDays(today, 55),
        priority: 'high', status: 'active', tags: ['hr', 'داخلی']
      });
      const p2 = Projects.create({
        title: 'مهاجرت به ابر', description: 'انتقال سرورهای داخلی به زیرساخت ابری',
        objectives: 'کاهش هزینه نگهداری سخت‌افزار',
        managerEmployeeId: ops1.id, memberIds: [ops1.id, dev1.id],
        departmentId: dIt.id, teamId: tInfra.id,
        startDate: Cal.addDays(today, -10), endDate: Cal.addDays(today, 120),
        priority: 'critical', status: 'active', tags: ['infra', 'cloud']
      });
      const p3 = Projects.create({
        title: 'کمپین استخدام بهاره', description: 'جذب ۵ نیروی فنی در بهار',
        managerEmployeeId: hr1.id, memberIds: [hr1.id],
        departmentId: dHr.id, teamId: tHr.id,
        startDate: Cal.addDays(today, -60), endDate: Cal.addDays(today, -5),
        priority: 'medium', status: 'completed', tags: ['hiring']
      });

      /* milestones */
      const ms1 = Projects.addMilestone(p1.id, { title: 'تأیید نیازمندی‌ها', dueDate: Cal.addDays(today, 7) });
      const ms2 = Projects.addMilestone(p1.id, { title: 'تحویل نسخه آزمایشی', dueDate: Cal.addDays(today, 35) });
      Projects.addMilestone(p2.id, { title: 'انتخاب ارائه‌دهنده', dueDate: Cal.addDays(today, 14) });

      /* tasks: p1 */
      const t1 = Tasks.create({ title: 'تحلیل نیازمندی‌ها', description: 'جمع‌آوری نیازمندی‌های منابع انسانی', projectId: p1.id, assigneeIds: [dev1.id], priority: 'high', startDate: Cal.addDays(today, -25), dueDate: Cal.addDays(today, -20) });
      Tasks.setStatus(t1, 'inprogress', { skipPerm: true });
      const t2 = Tasks.create({ title: 'طراحی پایگاه داده', projectId: p1.id, parentId: t1.id, assigneeIds: [dev2.id], priority: 'medium', dueDate: Cal.addDays(today, 3), status: 'inprogress', stage: 'اجرا' });
      const t3 = Tasks.create({ title: 'پیاده‌سازی ماژول مرخصی', projectId: p1.id, assigneeIds: [dev2.id], priority: 'high', dueDate: Cal.addDays(today, -2), status: 'inprogress', progress: 40, stage: 'اجرا' });
      const t4 = Tasks.create({ title: 'طراحی رابط کاربری', projectId: p1.id, assigneeIds: [dev1.id], priority: 'medium', dueDate: Cal.addDays(today, 10), deps: [t2.id], status: 'todo' });
      const t5 = Tasks.create({ title: 'آموزش کاربران', projectId: p1.id, assigneeIds: [hr1.id], priority: 'low', dueDate: Cal.addDays(today, 50), status: 'todo' });

      /* tasks: p2 */
      const t6 = Tasks.create({ title: 'ارزیابی ارائه‌دهندگان ابری', projectId: p2.id, assigneeIds: [ops1.id], priority: 'critical', dueDate: Cal.addDays(today, 5), status: 'inprogress', progress: 60 });
      const t7 = Tasks.create({ title: 'انتقال پایگاه داده', projectId: p2.id, assigneeIds: [ops1.id, dev1.id], priority: 'high', dueDate: Cal.addDays(today, 40), deps: [t6.id], status: 'todo' });
      const t8 = Tasks.create({ title: 'برنامه بازیابی بحران', projectId: p2.id, assigneeIds: [dev1.id], priority: 'medium', dueDate: Cal.addDays(today, 90), status: 'todo' });

      /* completed task with history */
      const t9 = Tasks.create({ title: 'تدوین آگهی استخدام', projectId: p3.id, assigneeIds: [hr1.id], priority: 'medium', dueDate: Cal.addDays(today, -40) });
      t9.resultSummary = 'آگهی‌ها در سه کانال منتشر شد';
      Tasks.setStatus(t9, 'inprogress', { skipPerm: true });
      Tasks.setStatus(t9, 'done', { skipPerm: true });

      /* progress updates */
      Tasks.addProgressUpdate(t3.id, {
        description: 'تکمیل فرم درخواست مرخصی', progress: 40, stage: 'اجرا',
        status: 'inprogress', problems: 'منتظر تأیید طراحی پایگاه داده', nextSteps: 'شروع فرم گزارش‌گیری'
      });
      Tasks.addProgressUpdate(t6.id, {
        description: 'مقایسه سه ارائه‌دهنده', progress: 60, stage: 'اجرا',
        status: 'inprogress', nextSteps: 'جمع‌بندی و ارائه به مدیر'
      });
      Tasks.addProgressUpdate(t1.id, {
        description: 'جلسات با ذی‌نفعان انجام شد', progress: 100, status: 'done',
        result: 'سند نیازمندی مصوب شد'
      });

      /* comments */
      Tasks.addComment(t2.id, 'الگوی نام‌گذاری را از سند معماری پیگیری کن');

      /* notifications */
      Notifications.notifyUsers([uEmp.id], 'taskAssigned', 'task', t3.id, { title: t3.title });
      Notifications.notifyUsers([uPm.id], 'deadline', 'task', t3.id, { title: t3.title });

      Store.audit('seed', 'system', null, 'demo data created');
      return { adminUsername: 'admin', adminPassword: opts.adminPassword || 'atlas1234' };
    } finally {
      Perms.systemMode = prevSystemMode;
    }
  }
};
