import { Vpc, UserData } from '@aws-cdk/aws-ec2';
import * as cdk from '@aws-cdk/core';
import ec2 = require('@aws-cdk/aws-ec2');

export class CdkStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const vpc = new Vpc(this, "InsVPC", { cidr: "10.0.0.0/16" })
    const intSG = new ec2.SecurityGroup(this, "IntSG", {
      allowAllOutbound: true,
      securityGroupName: "Internal Security Group",
      vpc: vpc
    });
    intSG.addIngressRule(intSG, ec2.Port.allTraffic());
    intSG.node.applyAspect(new cdk.Tag("Name", "Example-Internal"));

    const cmd = UserData.forLinux({ shebang: "#!/bin/bash" });
    // const SSM_AGENT_RPM='https://s3.amazonaws.com/ec2-downloads-windows/SSMAgent/latest/linux_amd64/amazon-ssm-agent.rpm';
    // cmd.addCommands(`sudo yum install -y ${SSM_AGENT_RPM}`, 'restart amazon-ssm-agent');
    cmd.addCommands("amazon-linux-extras install -y nginx1.12", "systemctl enable nginx", "systemctl start nginx");

    // The code that defines your stack goes here
    new ec2.CfnInstance(this, "InsNginx", {
      imageId: "ami-011facbea5ec0363b"
      ,instanceType: "t2.micro"
      ,subnetId: vpc.publicSubnets[0].subnetId
      ,securityGroupIds: [ vpc.vpcDefaultSecurityGroup ]
      ,userData: cdk.Fn.base64(cmd.render())
    })
  }
}
