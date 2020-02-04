import { Vpc, Port } from '@aws-cdk/aws-ec2';
import * as cdk from '@aws-cdk/core';
import ec2 = require('@aws-cdk/aws-ec2');

export class CdkStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const vpc = new Vpc(this, "InsVPC", { cidr: "10.0.0.0/16" })
    const intSG = new ec2.SecurityGroup(this, "IntSG", {
      allowAllOutbound: true,
      securityGroupName: "IsgNginx",
      vpc: vpc
    });
    intSG.addIngressRule(intSG, ec2.Port.tcp(22));
    intSG.addIngressRule(intSG, ec2.Port.tcp(80));
    // intSG.addIngressRule(intSG, ec2.Port.allTraffic());
    intSG.node.applyAspect(new cdk.Tag("Name", "IsgNginx-Internal"));

    const cmd = ec2.UserData.forLinux();//{ shebang: "#!/bin/bash" }
    const SSM_AGENT_RPM='https://s3.amazonaws.com/ec2-downloads-windows/SSMAgent/latest/linux_amd64/amazon-ssm-agent.rpm';
    cmd.addCommands('echo', 'hoge!');
    cmd.addCommands(`yum install -y ${SSM_AGENT_RPM}`, 'restart amazon-ssm-agent');
    cmd.addCommands("amazon-linux-extras install -y nginx1.12", "systemctl enable nginx", "systemctl start nginx");

    // The code that defines your stack goes here
    new ec2.CfnInstance(this, "Ec2Nginx", {
      imageId: "ami-011facbea5ec0363b"
      ,instanceType: "t2.micro"
      ,subnetId: vpc.publicSubnets[0].subnetId
      ,securityGroupIds: [ vpc.vpcDefaultSecurityGroup ]
      // ,userData: cdk.Fn.base64(`amazon-linux-extras install -y nginx1.12;systemctl enable nginx;systemctl start nginx`)
      ,userData: cdk.Fn.base64(cmd.render())
    })
  }
}
